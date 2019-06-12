'use babel';

import { Decoration, DisplayMarker, Range, TextEditor } from 'atom';


export type BranchCondition = 'defbranch' | 'ndefbranch';
export const defbranch: BranchCondition = 'defbranch';
export const ndefbranch: BranchCondition = 'ndefbranch'

// The DimensionDecorationManager stores decorations in multiple trees
// corresponding to the layout of dimensions in the text.
export class DimensionDecorationManager {
    dimension: string
    branchCondition: BranchCondition
    private decoration: Decoration
    children: DimensionDecorationManager[]
    marked: boolean

    // The parameters are optional because the top level Manager should not have
    // any choice/dimension as it's the entry point to all the child dimension/choice.
    constructor(dimension?: string, branchCondition?: BranchCondition, decoration?: Decoration) {
        if (dimension !== undefined) {
            this.dimension = dimension
        }
        if (branchCondition !== undefined) {
            this.branchCondition = branchCondition;
        }
        if (decoration !== undefined) {
            this.decoration = decoration;
        }
        this.children = [];

        this.marked = true;
    }

    // The classname of the underlying decoration.
    get className(): string {
        if (this.decoration) {
            return this.decoration.getProperties().class;
        }
        return null;
    }

    // The range of the underlying decoration.
    get range(): Range {
        if (this.decoration) {
            return this.decoration.getMarker().getBufferRange();
        }
        return null;
    }

    // Given a DisplayMarker and class name, creates a new decoration with
    // the dimensionName and branchCondition.
    // The class name for top level Decorations is
    // `dimension-marker-<dimensionName>-<branchCondition>` and all child
    // Decorations have class names formatted
    // `<parentClassName>-<dimensionName>-<branchCondition>`.
    addDecoration(marker: DisplayMarker, dimension: string, branchCondition: BranchCondition): void {
        let classPrefix: string;
        if (this.decoration) {
            // This manager is not the top level manager, so use it's classname
            // as the prefix for the new child manager.
            classPrefix = this.decoration.getProperties()['class'];
        }
        else {
            classPrefix = 'dimension-marker';
        }

        const className: string = `${classPrefix}-${dimension}-${branchCondition}`;
        let decoration: Decoration;

        if (this.children.length === 0) {
            decoration = this.createDecoration(marker, className);
            this.children.push(
                new DimensionDecorationManager(dimension, branchCondition, decoration));
            return;
        }

        // Compare the range of the marker to the children managers and designate
        // it as a sybling or a child's child.
        for (let i = 0; i < this.children.length; i++) {
            const node = this.children[i];
            const comparison: string = this.compareDecorations(marker, node.decoration.getMarker());

            if (comparison === 'child') {
                // This marker is a child's child, so add it to that child.
                return node.addDecoration(marker, dimension, branchCondition);
            }
            else if (comparison === 'above') {
                // The range of this marker is less than this child's range,
                // so place it before this child.
                decoration = this.createDecoration(marker, className);
                // Append the decoration to the end of children and swap left
                // until it is in the place of children[i].
                this.children.push(
                    new DimensionDecorationManager(dimension, branchCondition, decoration));
                for (let j = this.children.length - 1; j > i; j--) {
                    const temp = this.children[j];
                    this.children[j] = this.children[j - 1];
                    this.children[j - 1] = temp;
                }
                return;
            }
            else if (comparison === 'same') {
                // Update the branch and dimension to reflect those passed in.
                node.branchCondition = branchCondition;
                node.dimension = dimension;
                node.marked = true;
                return;
            }
        }

        // If execution reaches this point it means every comparison returned
        // 'above' so just append the decoration to children since it is below
        //  everything.
        decoration = this.createDecoration(marker, className);
        this.children.push(
            new DimensionDecorationManager(dimension, branchCondition, decoration));
    }

    // Compares decoration1 to decoration2.
    // If decoration1 encompasses decoration2, returns 'parent'.
    // If decoration1 is a sibling to decoration2, returns 'above' or 'below'
    // depending on whether decoration1 is above or below decoration2.
    // If decoration1 is encompassed by decoration2, returns 'child'
    compareDecorations(m1: DisplayMarker, m2: DisplayMarker): 'parent' | 'child' | 'above' | 'below' | 'same' {
        const r1: Range = m1.getBufferRange()
        const r2: Range = m2.getBufferRange();

        if (r1.containsRange(r2)) {
            return 'parent';
        }

        else if (r2.containsRange(r1)) {
            return 'child';
        }

        else if (r1.compare(r2) == -1 && !r1.intersectsWith(r2)) {
            return 'above';
        }

        else if (r1.compare(r2) == 1 && !r1.intersectsWith(r2)) {
            return 'below';
        }

        else if (r1.isEqual(r2)) {
            return 'same';
        }


        throw new Error('Dimension is malformed; it should be either a parent, child, above, or below');
    }

    createDecoration(marker: DisplayMarker, className: string) {
        const editor: TextEditor = atom.workspace.getActiveTextEditor();
        return editor.decorateMarker(
            marker,
            { type: 'line', class: className });
    }

    destroy() {
        if (this.decoration) {
            this.decoration.getMarker().destroy();
        }

        for (let child of this.children) {
            child.destroy();
        }
    }

    // Return this if it has a decoration otherwise return it's children.
    getDecorations(): DimensionDecorationManager[] {
        if (this.decoration) {
            return [this];
        }
        return this.children;
    }

    // Return all managers for a specific dimension.
    filterDimension(dimension: string): DimensionDecorationManager[] {
        const decorations: DimensionDecorationManager[] = [];

        if (this.decoration && this.dimension == dimension) {
            decorations.push(this);
        }

        for (let decoration of this.children) {
            decorations.push(...decoration.filterDimension(dimension));
        }

        return decorations;
    }

    // Return all managers for a specific dimension and choice.
    filterDimensionChoice(dimension: string, choice: BranchCondition): DimensionDecorationManager[] {
        const decorations: DimensionDecorationManager[] = [];

        if (this.decoration) {
            if (this.dimension == dimension && this.branchCondition == choice) {
                decorations.push(this);
            }
        }

        for (let decoration of this.children) {
            decorations.push(...decoration.filterDimensionChoice(dimension, choice));
        }

        return decorations;
    }

    // Recursively unmark DimensionDecorationManagers, unless they do not hold
    // a decoration.
    unmark() {
        if (this.decoration) {
            this.marked = false;
        }

        for (let decoration of this.children) {
            decoration.unmark();
        }
    }

    // Recursively delete unmarked DimensionDecorationManagers.
    sweep() {
        // First sweep all children. Otherwise the marked children wont be
        // propogated forward.
        const unmarked: DimensionDecorationManager[] = []
        for (let decoration of this.children) {
            decoration.sweep();
            if (!decoration.marked) {
                unmarked.push(decoration);
            }
        }

        // Replace any unmarked decorations with their child decorations.
        for (let unmarkedChild of unmarked) {
            const idx = this.children.indexOf(unmarkedChild);
            this.children.splice(idx, 1, ...unmarkedChild.children);
            // Destroy the decoration.
            unmarkedChild.decoration.getMarker().destroy();
        }
    }
}
