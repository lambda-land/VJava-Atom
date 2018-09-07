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
import path from 'path';

import { ChoiceNode, RegionNode, SegmentNode } from './ast';
import {
    BranchCondition,
    DimensionDecorationManager,
    defbranch,
    ndefbranch
} from './dimension-decoration-manager';
import { VariationalEditorView } from './variational-editor-view';
import { Queue, Stack } from './utils';

// Extend atom interfaces.
declare module 'atom' {
    export interface StyleManager {
        // This method is not documented in Atom's public API. This method
        // can be found in `src/style-manager.js` in Atom's GitHub.
        addStyleSheet(source: string, params?: any): Disposable;
    }
}

class VariationalEditor {
    decorations: DimensionDecorationManager;
    parsed: boolean;
    sidePanel: Panel;
    stylesheet: Disposable;
    subscriptions: CompositeDisposable;
    ui: VariationalEditorView;

    activate(state) {
        this.parsed = false;
        this.ui = new VariationalEditorView(state);
        this.ui.onColorChange(() => this.generateStyleSheet());
        this.sidePanel = atom.workspace.addRightPanel({
            item: this.ui.sidePanel,
            visible: false
        });
        this.subscriptions = new CompositeDisposable();

        // Register command that toggles veditor view
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'variational-editor:toggle': () => this.toggle()
        }));
    }

    deactivate() {
        this.decorations.destroy();
        this.sidePanel.destroy();
        this.subscriptions.dispose();
        this.ui.destroy();
    }

    serialize() {
        return this.ui.serialize();
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
                this.addDimensions(dimensions);
                this.generateStyleSheet();
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
            [thenNode.span.start[0] + 1, 0],
            [thenNode.span.end[0], 0]);
        const thenMarker: DisplayMarker = editor.markBufferRange(thenRange);

        this.decorations.addDecoration(thenMarker, node.name, thenBranch);

        if (node.elsebranch.segments.length > 0) {
            const elseNode = node.elsebranch;
            const elseRange: Range = new Range(
                [elseNode.span.start[0] + 1, 0],
                [elseNode.span.end[0], 0]);
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

    addDimensions(node: SegmentNode | RegionNode) {
        if (node.type === 'choice') {
            this.ui.createPanelMenu(node.name);
            this.addDecoration(node);
            this.addDimensions(node.thenbranch);
            this.addDimensions(node.elsebranch);
        }
        else if (node.type === 'region') {
            for (let segment of node.segments) {
                this.addDimensions(segment);
            }
        }
    }

    // Create a stylesheet for the dimension colors.
    // Use exhaustive BFS to generate the styles. This ensures the styles for
    // more nested dimensions appear later in the style sheet and have higher
    // specificity than less nested dimensions.
    generateStyleSheet(): void {
        interface QueueNode {
            // parentClass is useful for getting the linear gradient of the
            // parent dimension.
            parentClass: string,
            decorationManager: DimensionDecorationManager
        }

        const decorationQueue: Queue<QueueNode> = new Queue();

        for (let d of this.decorations.getDecorations()) {
            decorationQueue.push({ parentClass: undefined, decorationManager: d });
        }

        const linearGradientCache: { [key: string]: string } = {};
        let css: string = '';

        while (!decorationQueue.empty()) {
            const { parentClass, decorationManager } = decorationQueue.pop();

            for (let d of decorationManager.children) {
                decorationQueue.push(
                    { parentClass: decorationManager.className, decorationManager: d }
                );
            };

            if (!linearGradientCache.hasOwnProperty(decorationManager.className)) {
                const dimensionColor: string = this.ui.getDimensionColor(decorationManager.dimension);

                let branchcolor: string, branchcursorcolor: string, branchhovercolor: string;
                if (decorationManager.branchCondition === defbranch) {
                    branchcolor = this.shadeColor(dimensionColor, .1);
                    branchcursorcolor = this.shadeColor(dimensionColor, .2);
                    branchhovercolor = this.shadeColor(dimensionColor, .3);
                }
                else {
                    branchcolor = this.shadeColor(dimensionColor, -.3);
                    branchcursorcolor = this.shadeColor(dimensionColor, -.2);
                    branchhovercolor = this.shadeColor(dimensionColor, -.1);
                }

                let branchstyle: string, branchcursorstyle: string, branchhoverstyle: string;

                if (parentClass) {
                    // The background color for a line in a dimension uses the css
                    // function linear-gradient. Each nested dimension starts one
                    // percent higher than the parent dimension.
                    const parentStyle: string = linearGradientCache[parentClass];

                    // Generate the gradient percent for this dimension from the
                    // parentStyle's ending percent.
                    const lastStyleGradientIndex: number = parentStyle.lastIndexOf(' ') + 1;
                    const styleGradient: number = parseInt(
                        parentStyle.slice(lastStyleGradientIndex).replace('%', ''),
                        10) + 1;

                    branchstyle = `${parentStyle}, ${branchcolor} ${styleGradient}%`;
                    branchcursorstyle = `${parentStyle}, ${branchcursorcolor} ${styleGradient}%`;
                    branchhoverstyle = `${parentStyle}, ${branchhovercolor} ${styleGradient}%`;

                    css += `atom-text-editor div.${decorationManager.className}.line { background: linear-gradient(90deg, ${branchstyle}) }\n`;
                    css += `atom-text-editor div.${decorationManager.className}.line.cursor-line { background: linear-gradient(90deg, ${branchcursorstyle}) }\n`;
                    css += `atom-text-editor div.${decorationManager.className}.line.hover-alt { background: linear-gradient(90deg, ${branchhoverstyle}) }\n`;
                }
                else {
                    // No parentClass so the background-color should be a solid color.
                    css += `atom-text-editor div.${decorationManager.className}.line { background-color: ${branchcolor} }\n`;
                    css += `atom-text-editor div.${decorationManager.className}.line.cursor-line { background-color: ${branchcursorcolor} }\n`;
                    css += `atom-text-editor div.${decorationManager.className}.line.hover-alt { background-color: 90deg, ${branchhovercolor} }\n`;

                    branchstyle = `${branchcolor} 0%`; // For use by child classes that require linear-gradient.
                }

                // Add branchstyle to stylesCache.
                linearGradientCache[decorationManager.className] = branchstyle;
            }
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

        // The regex matches on 'rgb(x, y, z)' and returns a pair
        // ['rgb(x, y, z)', 'x, y, z']
        const rgbMatch: string[] = rgb.match(/rgb\(([^)]*)\)/);
        const rgbValues: string[] = rgbMatch[1].split(',');

        // convert to decimal and change luminosity
        return `rgba(${Math.floor(parseInt(rgbValues[0], 10) * lum)}, ${Math.floor(parseInt(rgbValues[1], 10) * lum)}, ${Math.floor(parseInt(rgbValues[2], 10) * lum)}, .3)`;
    }
};

export default new VariationalEditor();
