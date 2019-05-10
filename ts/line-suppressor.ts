'use babel';

import {
    Decoration,
    Disposable,
    Range
} from 'atom';


type emitFoldSig = (nextHunk: any, decorationIterator: any, endBufferRow: any) => void;
type FoldId = number

declare module 'atom' {
    interface ScreenLineBuilder {
        emitFold: emitFoldSig;
        emitOpenTag: (number, boolean) => void;
        getBuiltInScopeId: (number) => number;
    }

    interface DisplayLayer {
        foldCharacter: string;
        registerBuiltInScope: (number, string) => number;
        screenLineBuilder: ScreenLineBuilder;
    }
}
// class Line {
//     constructor(public decoration: Decoration, public foldId?: number) { }

//     getBufferRange(): Range {
//         return this.decoration.getMarker().getBufferRange();
//     }

//     get row(): number {
//         return this.getBufferRange().start.row;
//     }
// }

const HIDDENFOLD = (1 << -1) | (1 << 7); // Bitwise OR the FOLD flag (1 << 7) with our own flag for hidden folds.

// This class hides all lines it tracks unless the cursor is on a line it is
// tracking. This only applies to the line the cursor is on.
export class LineSuppressor {
    private cursorCBDisposable: Disposable;
    private hiddenLines: FoldId[];
    private _emitFold: emitFoldSig;
    private emitFold: emitFoldSig;
    private _emitOpenTag: (number, boolean) => void;
    private emitOpenTag: (number, boolean) => void;
    private originalFoldCharacter: string;
    private stylesheet: Disposable;

    constructor() {
        const editor = atom.workspace.getActiveTextEditor();
        editor.displayLayer.registerBuiltInScope(HIDDENFOLD, 'fold-marker suppress-line');
        this._emitOpenTag = editor.displayLayer.screenLineBuilder.emitOpenTag;
        this.emitOpenTag = this._emitOpenTag.bind(editor.displayLayer.screenLineBuilder);
        this._emitFold = editor.displayLayer.screenLineBuilder.emitFold;
        this.emitFold = this._emitFold.bind(editor.displayLayer.screenLineBuilder);
        this.originalFoldCharacter = editor.displayLayer.foldCharacter;

        editor.displayLayer.screenLineBuilder.emitFold = (nextHunk, decorationIterator, endBufferRow) => {
            this.emitHiddenFold(nextHunk, decorationIterator, endBufferRow);
        };
        this.hiddenLines = [];

        this.cursorCBDisposable = editor.onDidChangeCursorPosition((e) => {
            this.displayLine(e);
        });

        this.stylesheet = atom.styles.addStyleSheet('.line .fold-marker.suppress-line { visibility: hidden };')
    }

    destroy() {
        const editor = atom.workspace.getActiveTextEditor();
        editor.displayLayer.screenLineBuilder.emitOpenTag = this._emitOpenTag;
        editor.displayLayer.screenLineBuilder.emitFold = this._emitFold;

        for (let foldId of this.hiddenLines) {
            // Destory the lines
            if (foldId !== null) {
                editor.displayLayer.destroyFold(foldId);
            }
        }

        this.cursorCBDisposable.dispose();
        this.stylesheet.dispose();
    }

    // Add the buffer row to the lines that should be suppressed.
    add(bufferRow: number) {
        const range = new Range([bufferRow - 1, Infinity], [bufferRow, Infinity]);
        let foldId = this.findFoldIdForRange(range);

        if (foldId === null) {
            const editor = atom.workspace.getActiveTextEditor();
            foldId = editor.foldBufferRange(range);
            this.hiddenLines.push(foldId);
        }
    }

    emitHiddenFold(nextHunk: any, decorationIterator: any, endBufferRow: any) {
        const editor = atom.workspace.getActiveTextEditor();
        // console.log(nextHunk, decorationIterator, endBufferRow);
        const foldId = this.findFoldIdForRange(new Range(nextHunk.oldStart, nextHunk.oldEnd));
        if (foldId !== null) {
            // editor.displayLayer.foldCharacter = "";
            editor.displayLayer.screenLineBuilder.emitOpenTag = (scopeId: number, reopenTags: boolean = true) => {
                this.emitOpenTag(editor.displayLayer.screenLineBuilder.getBuiltInScopeId(HIDDENFOLD), reopenTags);
            };
        }
        // else {
        //     // editor.displayLayer.foldCharacter = this.originalFoldCharacter;
        //     editor.displayLayer.screenLineBuilder.emitOpenTag = this._emitOpenTag;
        // }

        this.emitFold(nextHunk, decorationIterator, endBufferRow);

        editor.displayLayer.screenLineBuilder.emitOpenTag = this._emitOpenTag;
    }

    // removeLine(line: Line) {
    //     const ind = this.hiddenLines.indexOf(line);

    //     if (ind != -1) {
    //         this.hiddenLines.splice(ind, 1);
    //     }
    // }

    // Callback for when cursor changes position.
    // If the line the cursor is on is suppressed, make it visible. Otherwise
    // ensure all lines are suppressed.
    displayLine(e) {
        const cursor = e.cursor;
        const cursorPos = e.newBufferPosition;
        const oldCursorPos = e.oldBufferPosition;

        // Hide visible line if the cursor is no longer on the same row as it.


        // Find the hidden line that is on the same row as the cursor if
        // any.


        // If there is a hidden line on the same row as the cursor, make
        // it visible.
        // if (marker) {
        //     this.showLineForMarker(marker);

        //     // If the cursor is moving down, make sure the cursor is at the
        //     // beginning of the line.
        //     if (cursorPos.row > oldCursorPos.row) {
        //         cursor.moveToBeginningOfLine();
        //     }
        //     // If the cursor is moving up, make sure the cursor is at the end
        //     // of the line.
        //     else if (cursorPos.row < oldCursorPos.row) {
        //         cursor.moveToEndOfLine();
        //     }
        // }
    }

    findFoldIdForRange(range: Range): FoldId {
        const editor = atom.workspace.getActiveTextEditor();
        for (let foldId of this.hiddenLines) {
            let marker = editor.displayLayer.foldsMarkerLayer.getMarker(foldId);
            if (marker.getRange().isEqual(range)) {
                return foldId;
            }
        }
        return null;
    }

    hideVisibleLine() {
    }

    // showLineForMarker(marker: DisplayMarker) {
    //     this.visibleLine = marker;
    //     this.removeLine(marker);
    //     this.uncacheLine(marker.getBufferRange().start.row);
    // }
}
