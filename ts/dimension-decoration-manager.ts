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
    }

    get className(): string {
        if (this.decoration) {
            return this.decoration.getProperties().class;
        }
        return null;
    }

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
    // `<parentClassName>-<dimensionName>-<branchCondition`.
    addDecoration(marker: DisplayMarker, dimension: string, branchCondition: BranchCondition): void {
        let classPrefix: string;
        if (this.decoration) {
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

        for (let i = 0; i < this.children.length; i++) {
            const node = this.children[i];
            const comparison: string = this.compareDecorations(marker, node.decoration.getMarker());

            if (comparison === 'child') {
                return node.addDecoration(marker, dimension, branchCondition);
            }

            if (comparison === 'above') {
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
    compareDecorations(m1: DisplayMarker, m2: DisplayMarker): 'parent' | 'child' | 'above' | 'below' {
        const r1: Range = m1.getBufferRange()
        const r2: Range = m2.getBufferRange();

        if (r1.containsRange(r2)) {
            return 'parent';
        }

        if (r2.containsRange(r1)) {
            return 'child';
        }

        if (r1.compare(r2) == -1 && !r1.intersectsWith(r2)) {
            return 'above';
        }

        if (r1.compare(r2) == 1 && !r1.intersectsWith(r2)) {
            return 'below';
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

    getDecorations(): DimensionDecorationManager[] {
        if (this.decoration) {
            return [this];
        }
        return this.children;
    }

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
}
