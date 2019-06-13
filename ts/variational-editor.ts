'use babel';

// Import npm modules.
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

// Import local modules.
import { ChoiceNode, RegionNode, SegmentNode } from './ast';
import {
    BranchCondition,
    DimensionDecorationManager,
    defbranch,
    ndefbranch
} from './dimension-decoration-manager';

import { PredicateSuppressor } from './predicate-suppressor';
import { VariationalEditorView } from './variational-editor-view';
import { Queue } from './utils';

// Extend atom interfaces.
declare module 'atom' {
    interface DisplayLayer {
        destroyFold: (id: number) => void;
        foldsMarkerLayer: MarkerLayer;
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
        // This method can be found in `src/text-editor.js` in Atom's Github.
        foldBufferRowRange(startRow: number, endRow: number): number;
        // This method can be found in `src/text-editor.js` in Atom's GitHub.
        destroyFoldsIntersectingBufferRange(range: Range): Range[]
    }
}

// This is the entry point to Atom. It manages all components of the Variational
// Editor frontend.
class VariationalEditor {
    private choiceFolds: {
        [dimensionName: string]: {
            branchCondition: BranchCondition;
            foldIds: number[];
        }
    };
    private decorations: DimensionDecorationManager;
    private onDidStopChangeCB: Disposable;
    private hiddenPredicates: PredicateSuppressor;
    private parsed: boolean;
    private sidePanel: Panel;
    private stylesheet: Disposable;
    private subscriptions: CompositeDisposable;
    private ui: VariationalEditorView;

    // This method is called when variational-editor-atom is first turned on.
    activate(state) {
        this.parsed = false;
        this.ui = new VariationalEditorView(state);

        // Whenever the dimension color is changed in the side panel, create
        // a new stylesheet.
        this.ui.onColorChange(() => this.generateStyleSheet());
        // Whenever a choice is toggled in the side panel, show/hide those
        // choices.
        this.ui.onChooseChoice((dimension: string, condition: BranchCondition) => {
            this.showDimensionChoice(dimension, condition)
        });

        this.sidePanel = atom.workspace.addRightPanel({
            item: this.ui.sidePanel,
            visible: false
        });
        this.subscriptions = new CompositeDisposable();

        // Register command that toggles variational-editor-atom.
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'variational-editor:toggle': () => this.toggle()
        }));
    }

    // This method is called before Atom exits.
    deactivate() {
        const editor = atom.workspace.getActiveTextEditor();
        Object.keys(this.choiceFolds).forEach((key) => {
            const choice = this.choiceFolds[key];
            for (let foldId of choice.foldIds) {
                editor.displayLayer.destroyFold(foldId);
            }
        });
        this.decorations.destroy();
        this.hiddenPredicates.destroy();
        this.onDidStopChangeCB.dispose();
        this.stylesheet.dispose();
        this.subscriptions.dispose();
        this.sidePanel.destroy();
        this.ui.destroy();
    }

    // Save color state of the dimensions in the side panel. This method is
    // called by Atom before exiting.
    serialize() {
        return this.ui.serialize();
    }

    // Toggle the UI on/off.
    toggle() {
        const editor = atom.workspace.getActiveTextEditor();

        if (this.parsed) {
            // Unfold all folded choices.
            Object.keys(this.choiceFolds).forEach((key) => {
                const choice = this.choiceFolds[key];
                for (let foldId of choice.foldIds) {
                    editor.displayLayer.destroyFold(foldId);
                }
            });

            this.onDidStopChangeCB.dispose();
            this.decorations.destroy();
            this.stylesheet.dispose();
            // Hide the side panel, but don't destroy it. Then it does not need
            // to be recreated every time the UI is toggled on.
            this.sidePanel.hide();
        } else {
            // When the text is changed, reparse the buffer contents.
            this.onDidStopChangeCB = editor.onDidStopChanging(() => {
                const contents = atom.workspace.getActiveTextEditor().getText();
                //parse the file
                this.parseVariation(contents);
            });

            this.choiceFolds = {};
            this.decorations = new DimensionDecorationManager();
            this.hiddenPredicates = new PredicateSuppressor();

            // Parse the file to update the UI for the current state of the
            // buffer.
            const contents = atom.workspace.getActiveTextEditor().getText();
            this.parseVariation(contents, () => { this.sidePanel.show(); });
        }

        this.parsed = !this.parsed;
    }

    // Accepts file contents as a string and a function to be run once the file
    // has been parsed and the UI updated.
    parseVariation(textContents: string, next?: () => void) {
        // Get the path to the variational-parser.
        const packagePath = atom.packages.resolvePackagePath("variational-editor-atom");
        const parserPath = path.resolve(packagePath, "lib", "variational-parser");

        // Run the parser in a new process.
        const parserProcess = spawn(parserPath, [], { cwd: packagePath });
        parserProcess.stdout.setEncoding('utf8');

        // Read the data from the parser process as it comes in.
        let data = '';
        parserProcess.stdout.on('data', (chunk) => {
            data += chunk.toString();
        });

        // When the process exits, update the UI.
        // NOTE: Currently `code` isn't used, but it's required because the
        //       process passes a code to this function. For now ignore any
        //       typescript warnings about its value never being read.
        parserProcess.on('exit', (code) => {
            const dimensions = JSON.parse(data);

            if (dimensions.type === 'region') {
                // To eliminate dimension that should no longer exist, use mark
                // and sweep similar to garbage collection. Unmark all
                // dimensions, parse the file and add the dimension, then sweep
                // all dimensions that remain unmarked.
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

    // Create a decoration for a given predicate directive block.
    addDecoration(node: ChoiceNode) {
        const editor: TextEditor = atom.workspace.getActiveTextEditor();

        // Determine if the then branch is positive or negative.
        let thenBranch: BranchCondition;
        if (node.kind === 'positive') {
            thenBranch = defbranch;
        }
        else {
            thenBranch = ndefbranch;
        }

        // Create a display marker for the then branch.
        const thenNode = node.thenbranch;
        const thenRange: Range = new Range(
            [thenNode.span.start[0] + 1, 0],
            [thenNode.span.end[0], 0]);
        const thenMarker: DisplayMarker = editor.markBufferRange(thenRange);

        // Add the marker to the decoration manager for this dimension/choice region.
        this.decorations.addDecoration(thenMarker, node.name, thenBranch);

        // If the else branch exists on this node, add it in the same manner.
        if (node.elsebranch.segments.length > 0) {
            let elseBranch: BranchCondition;
            if (thenBranch === defbranch) {
                elseBranch = ndefbranch;
            }
            else {
                elseBranch = defbranch;
            }

            const elseNode = node.elsebranch;
            const elseRange: Range = new Range(
                [elseNode.span.start[0] + 1, 0],
                [elseNode.span.end[0], 0]);
            const elseMarker: DisplayMarker = editor.markBufferRange(elseRange);

            this.decorations.addDecoration(elseMarker, node.name, elseBranch);
        }
    }

    // Recursively add dimensions/choices to the UI.
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

        // Find the choices that should be folded for this dimension.
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
        // The range of dimension choices starts at column 0 of the dimensions
        // preprocessor directive. Since this directive is folded by the
        // PredicateSuppressor, the fold for the dimension range should start
        // one line below the preprocessor directive.
        // The range of dimension choices ends at column 0 of the row the next
        // preprocessor directive begins (ex. for "#ifdef", the range ends before
        // the "#" in "#else"). This range results in the next preprocessor
        // directive starting on the same line as the fold. We want it to start
        // on the line after the fold, so adjust the range accordingly.
        for (let choice of foldChoices) {
            const newStartRow: number = choice.range.start.row + 1;
            const newEndRow: number = choice.range.end.row - 1;
            const range: Range = new Range(
                [newStartRow, 0],
                [newEndRow, Infinity]);
            foldRanges.push(range)
        }

        // Generate new folds for the dimension choices.
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

        // Use queue for BFS of dimension/choices.
        const decorationQueue: Queue<QueueNode> = new Queue();

        // Prime the queue with the top level choices.
        for (let d of this.decorations.getDecorations()) {
            decorationQueue.push({ parentClass: undefined, decorationManager: d });
        }

        // The CSS generated contains linear gradient styles. In order to build
        // up the linear gradients for successive dimensions, it is easier to
        // cache the style in a map.
        const linearGradientCache: { [key: string]: string } = {};
        let css: string = '';

        while (!decorationQueue.empty()) {
            const { parentClass, decorationManager } = decorationQueue.pop();

            // Add the child choices to the queue.
            for (let d of decorationManager.children) {
                decorationQueue.push(
                    { parentClass: decorationManager.className, decorationManager: d }
                );
            };

            if (!linearGradientCache.hasOwnProperty(decorationManager.className)) {
                // The linear gradient cache does not have a style for the current
                // classname, so generate the style for it.
                const dimensionColor: string = this.ui.getDimensionColor(decorationManager.dimension);

                let branchcolor: string, branchcursorcolor: string, branchhovercolor: string;
                // Differentiate the shade of the color for positive/negative
                // choices and for different states of the line in the editor.
                // (ie. when hovering over a line, a cursor is on the line, etc.)
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
                    // The background color for a line in a dimension uses the CSS
                    // function linear-gradient. Each nested dimension starts one
                    // percent higher than the parent dimension.
                    const parentStyle: string = linearGradientCache[parentClass];

                    // Generate the gradient percent for this dimension from the
                    // parentStyle's ending percent.
                    const lastStyleGradientIndex: number = parentStyle.lastIndexOf(' ') + 1;
                    const styleGradient: number = parseInt(
                        parentStyle.slice(lastStyleGradientIndex).replace('%', ''),
                        10) + 1;

                    // Create the styles that will be applied to the linear gradient.
                    branchstyle = `${parentStyle}, ${branchcolor} ${styleGradient}%`;
                    branchcursorstyle = `${parentStyle}, ${branchcursorcolor} ${styleGradient}%`;
                    branchhoverstyle = `${parentStyle}, ${branchhovercolor} ${styleGradient}%`;

                    // Create the styles for the dimension/choice classname.
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

                // Add branchstyle to the linear gradient cache for use by any
                // child choices when creating linear gradients.
                linearGradientCache[decorationManager.className] = branchstyle;
            }
        }

        // Add the stylesheet to the editor.
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
