'use babel';

import {
    DisplayLayer,
    DisplayMarker,
    DisplayMarkerLayer,
    Disposable,
    FindDisplayMarkerOptions,   // Needed for findMarkers method of DisplayMarkerLayer
    Range
} from 'atom';

namespace superstring {
    // superstring.TextBuffer is the underlying C/C++ text buffer. This holds
    // the actual contents of the file and acts as the layer between Atom and
    // the file on disk. Overriding methods of this class allows for injecting
    // text into Atom without modifying the text in the buffer.
    export class TextBuffer {
        // Get the text for the line in the buffer.
        lineForRow: (number) => string;
    }
}

declare module 'atom' {
    interface DisplayLayer {
        buffer: superstring.TextBuffer;
        // The display layer for a TextEditor caches lines from
        // superstring.TextBuffer.
        cachedScreenLines: string[];
    }
}

// This class hides all lines it tracks unless the cursor is on a line it is
// tracking. This only applies to the line the cursor is on.
export class LineSuppressor {
    private cursorCBDisposable: Disposable;
    private hiddenLines: DisplayMarker[];
    private visibleLine: DisplayMarker;
    private _lineForRow: (number) => string;
    private lineForRow: (number) => string;

    constructor() {
        const editor = atom.workspace.getActiveTextEditor();
        this.hiddenLines = [];

        // Capture the buffers original lineForRow method and bind the buffer
        // as the this keyword for that method.
        const buffer = this.getBuffer();
        // Store the original method in order to restore it when destroyed.
        this._lineForRow = buffer.lineForRow; 
        this.lineForRow = this._lineForRow.bind(buffer)

        // Override the buffers lineForRow method.
        buffer.lineForRow = (bufferRow: number) => {
            const marker = this.findMarkerAtRow(bufferRow);

            // If there is a marker for this line, return a new line.
            if (marker) {
                return '\n';
            }

            // Call stored lineForRow on LineSuppressor.
            return this.lineForRow(bufferRow);
        }

        this.cursorCBDisposable = editor.onDidChangeCursorPosition((e) => {
            this.displayLine(e);
        });
    }

    destroy() {
        for (let marker of this.hiddenLines) {
            // Get the buffer row first since it will be 0 after destroying
            // the marker.
            let bufferRow = marker.getBufferRange().start.row
            marker.destroy();
            // Uncache the buffer row for the destroyed marker.
            this.uncacheLine(bufferRow);
        }
        if (this.visibleLine) { this.visibleLine.destroy(); };
        this.getBuffer().lineForRow = this._lineForRow;
        this.cursorCBDisposable.dispose();
    }

    // Add the buffer row to the lines that should be suppressed.
    add(bufferRow: number) {
        let marker = this.findMarkerAtRow(bufferRow);

        if (!marker) {
            const editor = atom.workspace.getActiveTextEditor();
            
            marker = editor.markBufferRange(
                new Range([bufferRow, 0], [bufferRow, Infinity]),
                {'invalidate': 'touch'});

            if (editor.getCursorBufferPosition().row === bufferRow) {
                this.visibleLine = marker
            }
            else {
                this.addMarker(marker);
            }

            this.uncacheLine(bufferRow);
        }
    }

    addMarker(marker: DisplayMarker) {
        this.hiddenLines.push(marker);
    }

    
    removeMarker(marker: DisplayMarker) {
        const ind = this.hiddenLines.indexOf(marker);

        if (ind != -1) {
            this.hiddenLines.splice(ind, 1);
        }
    }

    // Callback for when cursor changes position.
    // If the line the cursor is on is suppressed, make it visible. Otherwise
    // ensure all lines are suppressed.
    displayLine(e) {
        const cursor = e.cursor;
        const cursorPos = e.newBufferPosition;
        const oldCursorPos = e.oldBufferPosition;

        // Hide visible line if the cursor is no longer on the same row as it.
        if (this.visibleLine && this.visibleLine.getBufferRange().start.row != cursorPos.row) {
            this.hideVisibleLine();
        }

        // Find the hidden line that is on the same row as the cursor if
        // any.
        const marker = this.findMarkerAtRow(cursorPos.row);

        // If there is a hidden line on the same row as the cursor, make
        // it visible.
        if (marker) {
            this.showLineForMarker(marker);

            // If the cursor is moving down, make sure the cursor is at the
            // beginning of the line.
            if (cursorPos.row > oldCursorPos.row) {
                cursor.moveToBeginningOfLine();
            }
            // If the cursor is moving up, make sure the cursor is at the end
            // of the line.
            else if (cursorPos.row < oldCursorPos.row) {
                cursor.moveToEndOfLine();
            }
        }
    }

    findMarkerAtRow(bufferRow: number): DisplayMarker {
        for (let marker of this.hiddenLines) {
            if (marker.getBufferRange().start.row === bufferRow) {
                return marker
            }
        }
        return null;
    }

    getBuffer(): superstring.TextBuffer {
        return this.getDisplayLayer().buffer;
    }

    getDisplayLayer(): DisplayLayer {
        return atom.workspace.getActiveTextEditor().displayLayer;
    }

    hideVisibleLine() {
        const marker = this.visibleLine;
        if (marker) {
            this.addMarker(marker);
            this.visibleLine = null;
            this.uncacheLine(marker.getBufferRange().start.row);
        }
    }

    showLineForMarker(marker: DisplayMarker) {
        this.visibleLine = marker;
        this.removeMarker(marker);
        this.uncacheLine(marker.getBufferRange().start.row);
    }

    // Delete the cached screen line at the buffer row. This will force
    // atom to rerender the line and will display the line.
    uncacheLine(bufferRow: number) {
        delete this.getDisplayLayer().cachedScreenLines[bufferRow];
    }
}
