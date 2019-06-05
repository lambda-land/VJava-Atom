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
import { Queue } from './utils';

// Extend atom interfaces.
declare module 'atom' {
    interface DisplayLayer {
        destroyFold: (id: number) => void;
    }

    // These methods are not documented in Atom's public API.
    export interface StyleManager {
        // This method can be found in `src/style-manager.js` in Atom's GitHub.
        addStyleSheet(source: string, params?: any): Disposable;
    }

    export interface TextEditor {
        // Access to underlying fold markers.
        displayLayer: DisplayLayer;
        // This method can be found in `src/text-editor.js` in Atom's GitHub.
        foldBufferRange(range: Range): number;
        // This method can be found in `src/text-editor.js` in Atom's GitHub.
        destroyFoldsIntersectingBufferRange(range: Range): Range[]
    }
}

class VariationalEditor {
    private choiceFolds: {
        [dimensionName: string]: {
            branchCondition: BranchCondition;
            foldIds: number[];
        }
    };
    private decorations: DimensionDecorationManager;
    private onDidStopChangeCB: Disposable;
    private parsed: boolean;
    private sidePanel: Panel;
    private stylesheet: Disposable;
    private subscriptions: CompositeDisposable;
    private ui: VariationalEditorView;

    activate(state) {
        this.parsed = false;
        this.ui = new VariationalEditorView(state);

        this.ui.onColorChange(() => this.generateStyleSheet());
        this.ui.onChooseChoice((dimension: string, condition: BranchCondition) => {
            this.showDimensionChoice(dimension, condition)
        });

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
        const editor = atom.workspace.getActiveTextEditor();
        if (this.parsed) {
            Object.keys(this.choiceFolds).forEach((key) => {
                const choice = this.choiceFolds[key];
                for (let foldId of choice.foldIds) {
                    editor.displayLayer.destroyFold(foldId);
                }
            });

            this.onDidStopChangeCB.dispose();
            this.decorations.destroy();
            this.stylesheet.dispose();
            this.sidePanel.hide();
        } else {
            this.onDidStopChangeCB = editor.onDidStopChanging(() => {
                const contents = atom.workspace.getActiveTextEditor().getText();
                //parse the file
                this.parseVariation(contents);
            });
            this.choiceFolds = {};
            this.decorations = new DimensionDecorationManager();

            const contents = atom.workspace.getActiveTextEditor().getText();
            //parse the file
            this.parseVariation(contents, () => { this.sidePanel.show(); });
        }

        this.parsed = !this.parsed;
    }

    parseVariation(textContents: string, next?: () => void) {
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
                // To eliminate dimension that should no longer exist,
                // use mark and sweep similar to garbage collection. Unmark all
                // dimensions, parse the updated file, then sweep all dimensions
                // that remain unmarked.
                this.decorations.unmark();
                this.ui.unmark();
                this.addDimensions(dimensions);
                this.decorations.sweep();
                this.ui.sweep();

                this.generateStyleSheet();

                if (next !== undefined) {
                    next();
                }
            }
            else {
                // TODO: Handle malformed output from backend. Throwing an error
                //       will create repeated bright red Error modal in Atom. Maybe
                //       create our own smaller, less distinct modal telling the
                //       user the dimensions are malformed? Possibly give the row
                //       and column where the issue is detected? Not sure if the
                //       backend can give that information.
            }
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

    // Show the choice for a dimension, folding the other choice.
    // If branchCondition is null, show all choices for the dimension.
    showDimensionChoice(dimension: string, branchCondition: BranchCondition | null): void {
        const editor = atom.workspace.getActiveTextEditor();
        const existingFolds = this.choiceFolds[dimension];

        const unfoldChoices: number[] = [];
        if (existingFolds !== undefined) {
            if (branchCondition === null) {
                // Unfold all choices.
                unfoldChoices.push(...existingFolds.foldIds);
            }
            else if (branchCondition === existingFolds.branchCondition) {
                // When existing folds are for the branch condition that should
                // be visible, unfold the branch condition.
                unfoldChoices.push(...existingFolds.foldIds);
            }
        }

        const foldChoices: DimensionDecorationManager[] = [];
        let foldBranch: BranchCondition = null;
        if (branchCondition === defbranch) {
            foldChoices.push(...this.decorations.filterDimensionChoice(dimension, ndefbranch));
            foldBranch = ndefbranch;
        }
        else if (branchCondition === ndefbranch) {
            foldChoices.push(...this.decorations.filterDimensionChoice(dimension, defbranch));
            foldBranch = defbranch;
        }

        const foldRanges: Range[] = [];
        // The range of dimension choices ends at column 0 of the row the next
        // preprocessor directive begins (ex. for "#ifdef", the range ends before
        // the "#" in "#else"). This range results in the next preprocessor
        // directive starting on the same line as the fold. We want it to start
        // on the line after the fold, so adjust the range accordingly.
        for (let choice of foldChoices) {
            const newEndRow: number = choice.range.end.row - 1;
            const range: Range = new Range(
                choice.range.start,
                [newEndRow, Infinity]);
            foldRanges.push(range)
        }

        // Generate new folds.
        if (foldBranch === null) {
            if (this.choiceFolds.hasOwnProperty(dimension)) {
                delete this.choiceFolds[dimension];
            }
        }
        else {
            this.choiceFolds[dimension] = {
                branchCondition: foldBranch,
                foldIds: foldRanges.map((r: Range) => {
                    return editor.foldBufferRange(r);
                })
            }
        }

        // Unfold previous folds (if any).
        unfoldChoices.forEach((foldId: number) => {
            editor.displayLayer.destroyFold(foldId);
        });
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
