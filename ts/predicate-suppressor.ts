'use babel';

import {
    CursorPositionChangedEvent,
    Decoration,
    DisplayLayer,
    Disposable,
    Marker,
    Point,
    Range
} from 'atom';


declare module 'atom' {
    interface ScreenLineBuilder {
        emitFold: emitFoldSig;
        emitOpenTag: (number, boolean) => void;
        getBuiltInScopeId: (number) => number;
    }

    interface DisplayLayer {
        cachedScreenLines: number[];
        registerBuiltInScope: (number, string) => number;
        screenLineBuilder: ScreenLineBuilder;
    }
}

type Direction = 'up' | 'down';
type emitFoldSig = (nextHunk: any, decorationIterator: any, endBufferRow: any) => void;
type emitOpenTagSig = (number, boolean) => void;
type FoldId = number

class Predicate {
    private foldId: FoldId;
    private decoration: Decoration;

    constructor(bufferRow: number) {
        const range = new Range([bufferRow, 0], [bufferRow, Infinity]);
        const editor = atom.workspace.getActiveTextEditor();
        this.decoration = editor.decorateMarker(
            editor.markBufferRange(range),
            { type: 'line' });
        this.foldId = null;
    }

    get hidden(): boolean {
        return this.foldId !== null;
    }

    get range(): Range {
        return this.decoration.getMarker().getBufferRange();
    }

    get hiddenRange(): Range {
        if (this.hidden) {
            const editor = atom.workspace.getActiveTextEditor();
            const marker = editor.displayLayer.foldsMarkerLayer.getMarker(this.foldId);
            return marker.getRange();
        }
    }

    createFoldRange(): Range {
        return new Range([this.range.start.row - 1, Infinity], this.range.end);
    }

    destroy() {
        this.show();            // This will destroy the fold.
        this.decoration.destroy();
    }

    hide() {
        if (!this.hidden) {
            const editor = atom.workspace.getActiveTextEditor();
            this.foldId = editor.foldBufferRange(this.createFoldRange());
        }
    }

    show() {
        if (this.hidden) {
            const editor = atom.workspace.getActiveTextEditor();
            editor.displayLayer.destroyFold(this.foldId);
            this.foldId = null;
        }
    }

    atRow(row: number): boolean {
        return this.range.start.row === row;
    }
}

class Predicates {
    private predicates: Predicate[];

    constructor(bufferRows: number[]) {
        this.predicates = [];
        for (let bufferRow of bufferRows) {
            this.predicates.push(new Predicate(bufferRow));
        }
    }

    destroy() {
        this.predicates.forEach(x => x.destroy());
    }

    hasRows(bufferRows: number[]) {
        if (bufferRows.length !== this.predicates.length) {
            return false;
        }

        for (let bufferRow of bufferRows) {
            let hasRow = this.predicates.filter(x => { return x.atRow(bufferRow) });
            if (!hasRow) {
                return false;
            }
        }

        return true;
    }

    hide() {
        this.predicates.forEach(x => x.hide());
    }
}

// This flag is used as a modified FOLD flag.
// see https://github.com/atom/text-buffer/blob/v13.15.3/src/screen-line-builder.js#L11
const HIDDENFOLD = (1 << -1) | (1 << 7); // Bitwise OR the FOLD flag (1 << 7) with our own flag for hidden folds.

// This class hides all predicates it tracks unless the cursor is on a line it is
// tracking. This only applies to the line the cursor is on.
// In order to properly hide the fold character "...", some of Atom's internal
// API calls that deal with the internal state of the editor need to be overwritten.
export class PredicateSuppressor {
    private displayLayer: DisplayLayer;
    private cursorCBDisposable: Disposable;
    private predicates: Predicates[];
    private _emitFold: emitFoldSig; // This is to store the original emitFold method.
    private emitFold: emitFoldSig;  // This will have the original ScreenLineBuilder object bound to it.
    private _emitOpenTag: emitOpenTagSig // This is to store the original emitOpenTag method.
    private emitOpenTag: emitOpenTagSig  // This will have the original ScreenLineBuilder object bound to it.
    private stylesheet: Disposable;

    constructor() {
        const editor = atom.workspace.getActiveTextEditor();
        this.displayLayer = editor.displayLayer;

        // Create a scope id for the HIDDENFOLD flag. This will create folds with
        // class "fold-marker suppress-line" when used with the custom emitFold method.
        editor.displayLayer.registerBuiltInScope(HIDDENFOLD, 'fold-marker suppress-line');

        // Store the methods from the ScreenLineBuilder object that are used to
        // emit folds.
        // see https://github.com/atom/text-buffer/blob/v13.15.3/src/screen-line-builder.js#L227 for emitFold.
        // see https://github.com/atom/text-buffer/blob/v13.15.3/src/screen-line-builder.js#L373 for emitOpenTag.
        this._emitOpenTag = editor.displayLayer.screenLineBuilder.emitOpenTag;
        this._emitFold = editor.displayLayer.screenLineBuilder.emitFold;
        // Bind the ScreenLineBuilder object to these methods so the this keyword
        // is refering to the ScreenLineBuilder when we call the original methods.
        this.emitOpenTag = this._emitOpenTag.bind(editor.displayLayer.screenLineBuilder);
        this.emitFold = this._emitFold.bind(editor.displayLayer.screenLineBuilder);

        // Override emitFold.
        editor.displayLayer.screenLineBuilder.emitFold = (nextHunk, decorationIterator, endBufferRow) => {
            this.emitHiddenFold(nextHunk, decorationIterator, endBufferRow);
        };

        this.predicates = [];

        this.cursorCBDisposable = editor.onDidChangeCursorPosition((e) => {
            this.displayLine(e);
        });

        // This stylesheet will make the folds created by LineSuppressor invisible.
        this.stylesheet = atom.styles.addStyleSheet('.line .fold-marker.suppress-line { visibility: hidden };')
    }

    destroy() {
        const editor = atom.workspace.getActiveTextEditor();
        editor.displayLayer.screenLineBuilder.emitOpenTag = this._emitOpenTag;
        editor.displayLayer.screenLineBuilder.emitFold = this._emitFold;

        for (let predicate of this.predicates) {
            // Destory the predicates.
            predicate.destroy()
        }

        this.cursorCBDisposable.dispose();
        this.stylesheet.dispose();
    }

    // Add the buffer row to the lines that should be suppressed.
    add(bufferRows: number[]) {
        let fold = this.findPredicateForRows(bufferRows);

        if (fold === null) {
            const predicate = new Predicates(bufferRows);
            predicate.hide();
            this.predicates.push(predicate);
        }
    }

    emitHiddenFold(nextHunk: any, decorationIterator: any, endBufferRow: any) {
        const editor = atom.workspace.getActiveTextEditor();
        const predicate = this.findHiddenPredicateForRange(new Range(nextHunk.oldStart, nextHunk.oldEnd));
        if (predicate !== null) {
            // Override emitOpenTag to use the HIDDENFOLD flag instead of the default
            // FOLD flag.
            editor.displayLayer.screenLineBuilder.emitOpenTag = (scopeId: number, reopenTags: boolean = true) => {
                this.emitOpenTag(
                    editor.displayLayer.screenLineBuilder.getBuiltInScopeId(HIDDENFOLD),
                    reopenTags);
            };
        }

        // Call the original emitFold method, which will call the custom emitOpenTag method
        // if the fold should be hidden.
        this.emitFold(nextHunk, decorationIterator, endBufferRow);

        // Reset emitOpenTag to the original method otherwise folds that shouldn't
        // be hidden will be.
        editor.displayLayer.screenLineBuilder.emitOpenTag = this._emitOpenTag;
    }

    // Callback for when cursor changes position.
    // If the line the cursor is on is suppressed, make it visible. Otherwise
    // ensure all lines are suppressed.
    displayLine(e: CursorPositionChangedEvent) {
        const cursorPos = e.newBufferPosition;
        const oldCursorPos = e.oldBufferPosition;

        // Hide predicate if no longer on line.
        if (oldCursorPos.row !== cursorPos.row) {
            const predicate = this.findPredicateForRow(oldCursorPos.row);
            if (predicate) {
                predicate.hide();
            }
        }

        // Show predicate if cursor "moved" to same line as predicate.
        // Since the predicates are folded, the cursor moves to the next
        // unfolded line. To counteract this, the folded predicate closest
        // to the old cursor position is made visible and the cursor is moved
        // to that line.
        let predicate: Predicates = null;
        if (cursorPos.row > oldCursorPos.row) {
            predicate = this.findPredicateForRow(oldCursorPos.row + 1);
        }
        else if (cursorPos.row < oldCursorPos.row) {
            predicate = this.findPredicateForRow(oldCursorPos.row - 1);
        }

        if (predicate && predicate.hidden) {
            predicate.show();
            // Set the position of the cursor to the same row as the predicate
            // while keeping the column constant.
            e.cursor.setBufferPosition([predicate.range.start.row, cursorPos.column]);
        }
    }

    findHiddenPredicateForRange(range: Range): Predicates {
        for (let predicate of this.predicates) {
            if (predicate.hidden && predicate.hiddenRange.isEqual(range)) {
                return predicate;
            }
        }
        return null;
    }

    findPredicateForRow(bufferRow: number) {
        for (let predicate of this.predicates) {
            if (predicate.hasRow(bufferRow)) {
                return predicate;
            }
        }
        return null;
    }

    findPredicateForRows(bufferRows: number[]): Predicates {
        for (let predicate of this.predicates) {
            if (predicate.hasRows(bufferRows)) {
                return predicate
            }
        }
        return null;
    }

    findPredicateForRange(range: Range): Predicates {
        for (let predicate of this.predicates) {
            if (predicate.range.isEqual(range)) {
                return predicate;
            }
        }
        return null;
    }
}
