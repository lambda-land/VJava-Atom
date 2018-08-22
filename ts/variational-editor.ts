'use babel';

import 'spectrum-colorpicker';
import {
    CompositeDisposable,
    DisplayMarker,
    Disposable,
    Panel,
    Range,
    TextEditor
} from 'atom';
import { spawn } from 'child_process';
import $ from 'jquery';
import path from 'path';

import { ChoiceNode, RegionNode, SegmentNode } from './ast';
import {
    BranchCondition,
    DecorationInfo,
    DimensionDecorationManager,
    defbranch,
    ndefbranch
} from './dimension-decoration-manager';
import {
    DimensionStatus,
    DimensionUI,
    NestLevel,
    Selector,
    VariationalEditorView
} from './variational-editor-view';


class VariationalEditor {
    decorations: DimensionDecorationManager
    nesting: NestLevel[]
    sidePanel: Panel
    stylesheet: Disposable
    ui: VariationalEditorView
    doc: RegionNode
    raw: string
    addChoiceLockout: boolean = false
    lastCursorLocation: TextBuffer.Point
    lastShowDoc: RegionNode
    popupListenerQueue: { element: HTMLElement, text: string }[]
    colorpicker: {}
    dimensionColors: {}
    activeChoices: Selector[] // in the form of dimensionId:thenbranch|elsebranch
    subscriptions: CompositeDisposable
    saveSubscription: Disposable
    tooltips: CompositeDisposable
    parsed: boolean

    activate(state) {
        this.parsed = false;
        this.ui = new VariationalEditorView(state);
        this.sidePanel = atom.workspace.addRightPanel({
            item: this.ui.sidePanel,
            visible: false
        });
        this.subscriptions = new CompositeDisposable();

        // Register command that toggles veditor view
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'variational-editor:toggle': () => this.toggle()
        }));

        // this.subscriptions.add(atom.commands.add('atom-workspace', {
        //     'variational-editor:undo': () => this.noUndoForYou()
        // }));
    }

    deactivate() {
    }

    serialize() {
    }

    toggle() {
        if (this.parsed) {
            this.decorations.destroy();
            this.stylesheet.dispose();
            this.sidePanel.hide();
        } else {
            this.decorations = new DimensionDecorationManager();
            var contents = atom.workspace.getActiveTextEditor().getText();

            //parse the file
            this.parseVariation(contents, () => { this.sidePanel.show(); });
        }

        this.parsed = !this.parsed;
    }

    parseVariation(textContents: string, next: () => void) {
        const packagePath = atom.packages.resolvePackagePath("variational-editor-atom");

        const parserPath = path.resolve(packagePath, "lib", "variational-parser");

        const parserProcess = spawn(parserPath, [], { cwd: packagePath });
        parserProcess.stdout.setEncoding('utf8');

        let data = '';
        parserProcess.stdout.on('data', (chunk) => {
            data += chunk.toString();
        });
        // Currently `code` isn't used, but it's required because the process
        // passes a code to this function. For now ignore any typescript
        // warnings about its value never being read.
        parserProcess.on('exit', (code) => {
            const dimensions = JSON.parse(data);

            if (dimensions.type === 'region') {
                this.ui.createPanelMenuItems(dimensions);
                this.addDecorations(dimensions);
                this.generateStyleSheet(); // TODO: Generate CSS based on decoration marker tree.
            }
            else {
                throw new TypeError('Expected segments attribute on parsed JSON');
            }

            next();
        });

        parserProcess.stdin.write(textContents);
        parserProcess.stdin.end();
    }

    addDecoration(node: ChoiceNode) {
        const editor: TextEditor = atom.workspace.getActiveTextEditor();

        let thenBranch: BranchCondition;
        if (node.kind === 'positive') {
            thenBranch = defbranch;
        }
        else {
            thenBranch = ndefbranch;
        }

        const thenNode = node.thenbranch;
        const thenRange: Range = new Range(
            [thenNode.span.start[0] + 1, thenNode.span.start[1]],
            [thenNode.span.end[0] - 1, thenNode.span.end[1]]);
        const thenMarker: DisplayMarker = editor.markBufferRange(thenRange);

        this.decorations.addDecoration(thenMarker, node.name, thenBranch);

        if (node.elsebranch.segments.length > 0) {
            const elseNode = node.elsebranch;
            const elseRange: Range = new Range(
                [elseNode.span.start[0] + 1, elseNode.span.start[1]],
                [elseNode.span.end[0] - 1, elseNode.span.end[1]]);
            const elseMarker: DisplayMarker = editor.markBufferRange(elseRange);

            let elseBranch: BranchCondition;
            if (thenBranch === defbranch) {
                elseBranch = ndefbranch;
            }
            else {
                elseBranch = defbranch;
            }

            this.decorations.addDecoration(elseMarker, node.name, elseBranch);
        }
    }

    addDecorations(node: SegmentNode | RegionNode) {
        if (node.type === 'choice') {
            this.addDecoration(node);
            this.addDecorations(node.thenbranch);
            this.addDecorations(node.elsebranch);
        }
        else if (node.type === 'region') {
            for (let segment of node.segments) {
                this.addDecorations(segment);
            }
        }
    }

    addViewListeners(dimension: DimensionUI) {
        $(`#${dimension.name}-view-both`).on('click', () => {
            this.unsetDimension(dimension.name);
        });

        $(`#${dimension.name}-view-elsebranch`).on('click', () => {
            this.setDimensionUndefined(dimension.name);
        });

        $(`#${dimension.name}-view-thenbranch`).on('click', () => {
            this.setDimensionDefined(dimension.name);
        });
    }

    generateStyleSheet() {
        const decorationQueue: DecorationInfo[] = this.decorations.getAllDecorationInfo();
        const stylesCache: { [key: string]: string } = {};
        let css: string = '';

        while (decorationQueue.length) {
            const decorationInfo: DecorationInfo = decorationQueue.shift();
            decorationQueue.push(...decorationInfo.children);

            if (stylesCache.hasOwnProperty(decorationInfo.className)) {
                continue;
            }

            const dimensionColor: string = this.ui.getDimensionColor(decorationInfo.dimension);

            let branchcolor: string, branchcursorcolor: string,
                branchhighlightcolor: string, branchhovercolor: string;
            if (decorationInfo.branchCondition === defbranch) {
                branchcolor = this.shadeColor(dimensionColor, .1);
                branchcursorcolor = this.shadeColor(dimensionColor, .2);
                branchhighlightcolor = this.shadeColor(dimensionColor, .3);
                branchhovercolor = branchhighlightcolor;
            }
            else {
                branchcolor = this.shadeColor(dimensionColor, -.3);
                branchcursorcolor = this.shadeColor(dimensionColor, -.2);
                branchhighlightcolor = this.shadeColor(dimensionColor, -.1);
                branchhovercolor = branchhighlightcolor;
            }

            let branchstyle: string, branchcursorstyle: string,
                branchhighlightstyle: string, branchhoverstyle: string;

            if (stylesCache.hasOwnProperty(decorationInfo.parentClassName)) {
                // The background color for a line in a dimension uses the css
                // function linear-gradient. Each nested dimension starts one
                // percent higher than the parent dimension.
                const parentStyle: string = stylesCache[decorationInfo.parentClassName];
                const lastStyleGradientInd: number = parentStyle.lastIndexOf(' ') + 1;
                const styleGradient: number = parseInt(
                    parentStyle.slice(lastStyleGradientInd).replace('%', ''),
                    10) + 1;

                branchstyle = `${parentStyle}, ${branchcolor} ${styleGradient}%`;
                branchcursorstyle = `${parentStyle}, ${branchcursorcolor} ${styleGradient}%`;
                branchhighlightstyle = `${parentStyle}, ${branchhighlightcolor} ${styleGradient}%`;
                branchhoverstyle = `${parentStyle}, ${branchhovercolor} ${styleGradient}%`;

                css += `atom-text-editor div.${decorationInfo.className}.line { background-color: linear-gradient(90deg, ${branchstyle}) }\n`;
                css += `atom-text-editor div.${decorationInfo.className}.line.cursor-line { background-color: linear-gradient(90deg, ${branchcursorstyle}) }\n`;
                css += `atom-text-editor div.${decorationInfo.className}.line.highlight { background-color: linear-gradient(90deg, ${branchhighlightstyle}) }\n`;
                css += `atom-text-editor div.${decorationInfo.className}.line.hover-alt { background-color: linear-gradient(90deg, ${branchhoverstyle}) }\n`;
            }
            else {
                // No parentClass so the background-color should be a solid color.
                css += `atom-text-editor div.${decorationInfo.className}.line { background-color: ${branchcolor} }\n`;
                css += `atom-text-editor div.${decorationInfo.className}.line.cursor-line { background-color: ${branchcursorcolor} }\n`;
                css += `atom-text-editor div.${decorationInfo.className}.line.highlight { background-color: ${branchhighlightcolor} }\n`;
                css += `atom-text-editor div.${decorationInfo.className}.line.hover-alt { background-color: 90deg, ${branchhovercolor} }\n`;

                branchstyle = `${branchcolor} 0%`; // For use by child classes that require linear-gradient.
            }

            // Add branchstyle to stylesCache.
            stylesCache[decorationInfo.className] = branchstyle;
        }

        const stylePath = path.resolve(
            atom.packages.resolvePackagePath('variational-editor-atom'),
            'styles',
            'projects',
            `${atom.workspace.getActiveTextEditor().getTitle()}.css`);
        this.stylesheet = atom.styles.addStyleSheet(css, { sourcePath: stylePath });
    }

    shadeColor(rgb: string, lum?: number) {
        lum = lum || 0;
        lum = lum + 1;

        // The regex matches on 'rgb(x, y , z)' and returns a pair
        // ['rgb(x, y, z)', 'x, y, z']
        const rgbMatch: string[] = rgb.match(/rgb\(([^)]*)\)/);
        const rgbValues: string[] = rgbMatch[1].split(',');

        // convert to decimal and change luminosity
        return `rgba(${Math.floor(parseInt(rgbValues[0], 10) * lum)}, ${Math.floor(parseInt(rgbValues[1], 10) * lum)}, ${Math.floor(parseInt(rgbValues[2], 10) * lum)}, .3)`;
    }

    removeDimension(dimName: string) {
        var sure = confirm('Are you sure you want to remove this dimension? Any currently \
              visible code in this dimension will be promoted. Any hidden code will be removed.')

        if (sure) {
            //find the dimension and remove it
            const dimension = this.ui.panelMenus[dimName];
            delete this.ui.panelMenus[dimName];
            dimension.colorpicker.remove();
            // for (var i = 0; i < this.ui.dimensions.length; i++) {
            //     if (this.ui.dimensions[i].name === dimName) {
            //         this.ui.dimensions.splice(i, 1);
            //         $("#" + dimName).remove();
            //     }
            // }
            // var selection: Selector = getSelectionForDim(dimName, this.ui.activeChoices);
            // this.deleteDimension(selection);
            // this.updateEditorText();
        }
    }

    setDimension(dimName: string, status: DimensionStatus) {
        for (var i = 0; i < this.ui.activeChoices.length; i++) {
            if (this.ui.activeChoices[i].name === dimName) {
                this.ui.activeChoices[i].status = status;
            }
        }
    }

    // show the thenbranch alternative
    setDimensionDefined(dimName: string) {
        this.setDimension(dimName, 'DEF');
    }

    // show the elsebranch alternative
    setDimensionUndefined(dimName: string) {
        this.setDimension(dimName, 'NDEF');
    }

    // hide the elsebranch alternative
    unsetDimension(dimName: string) {
        this.setDimension(dimName, 'BOTH');
    }

    // Currently `event` isn't used, but it's required because the event
    // listener passes an event to this function. For now ignore any typescript
    // warnings about its value never being read.
    // KeyDownCheck(event) {
    //     if (this.parsed === "parsed") {
    //         //make note of the last cursor position so we can use it on keyup
    //         var activeEditor = atom.workspace.getActiveTextEditor();
    //         var location = activeEditor.getCursorBufferPosition();
    //         this.lastCursorLocation = location;
    //     }
    // }

    // noUndoForYou() {
    //     if (this.parsed === "parsed") return;
    //     atom.commands.dispatch(atom.views.getView(atom.workspace.getActiveTextEditor()), "core:undo");
    // }
};

export default new VariationalEditor();
