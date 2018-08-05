'use babel';

import 'spectrum-colorpicker';
import { CompositeDisposable, Disposable, TextEditor } from 'atom';
import { spawn } from 'child_process';
import fs from 'fs';
import $ from 'jquery';
import path from 'path';

import {
    AlternativeInserter,
    ASTSearcher,
    ChoiceNode,
    ContentNode,
    DimensionDeleter,
    EditPreserver,
    NodeInserter,
    RegionNode,
    SegmentNode,
    ViewRewriter,
    docToPlainText,
    getSelectionForDim,
    getSelectionForNode,
    isBranchActive,
    renderDocument,
} from './ast';
import {
    Branch,
    DimensionStatus,
    DimensionUI,
    NestLevel,
    Selector,
    VariationalEditorView
} from './variational-editor-view'

// ----------------------------------------------------------------------------

//declared out here so that they may be accessed from the document itself
//only for debugging purposes.
function getdefbranchCssClass(dimName) {
    return 'dimension-marker-' + dimName + "-defbranch";
}

function getndefbranchCssClass(dimName) {
    return 'dimension-marker-' + dimName + "-ndefbranch";
}

// ----------------------------------------------------------------------------

function shadeColor(rgb: string, lum?: number) {

    lum = lum || 0;
    lum = lum + 1;

    // The regex matches on 'rgb(x, y , z)' and returns a pair
    // ['rgb(x, y, z)', 'x, y, z']
    const rgbMatch: string[] = rgb.match(/rgb\(([^)]*)\)/);
    const rgbValues: string[] = rgbMatch[1].split(',');

    // convert to decimal and change luminosity
    return `rgba(${Math.floor(parseInt(rgbValues[0], 10) * lum)}, ${Math.floor(parseInt(rgbValues[1], 10) * lum)}, ${Math.floor(parseInt(rgbValues[2], 10) * lum)}, .3)`;
}

// the heck is this state doing here?
const mainDivId = 'variationalEditorUI';
const enclosingDivId = 'enclosingDivEditorUI';
const secondaryDivId = 'variationalEditorUIButtons';

var iconsPath = path.resolve(atom.packages.resolvePackagePath("variational-editor-atom"),
    "icons");

class VariationalEditor {

    styles: { [selector: string]: string } = {}
    nesting: NestLevel[] // a stack represented nested dimensions
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
    state: "parsed" | "unparsed"

    // initialize the user interface
    // TODO: make this a function that returns an object conforming to VariationalEditor
    createUI() {
        var mainUIElement = $(`<div id='${enclosingDivId}'><div id='${mainDivId}'></div>
                           <div id='${secondaryDivId}' class='veditor-secondary'>
                             <a href='' id='addNewDimension'><img id='addNewDimensionImg' border="0" src="${iconsPath}/add_square_button.png" width="30" height="30"/> </a>
                           </div></div>`);
        this.ui.panel = atom.workspace.addRightPanel({ item: mainUIElement });
        this.ui.panel.hide();
        this.ui.main = mainUIElement.find(`#${mainDivId}`);
        this.ui.secondary = mainUIElement.find(`#${secondaryDivId}`);
        this.ui.message = this.ui.main.find("#message");
        this.ui.markers = [];

        // consider css :hover for this...
        $("#addNewDimension").on('mouseover', () => {
            $('#addNewDimensionImg').attr('src', `${iconsPath}/add_square_button_depressed.png`);
        });
        $("#addNewDimension").on('mouseout', () => {
            $('#addNewDimensionImg').attr('src', `${iconsPath}/add_square_button.png`);
        });

        // TODO: this click handler needs a name and a place to live.
        $("#addNewDimension").on('click', () => {
            var dimName = 'NEW';

            var dimension: DimensionUI = {
                name: dimName,
                color: 'rgb(127, 71, 62)'
            };

            var nameDiv = $(`<div class='form-group dimension-ui-div' id='new-dimension'><h2><input id='new-dimension-name' class='native-key-bindings new-dimension-name' type='text' value='${dimName}'></h2></div>`)

            this.ui.main.append(nameDiv);

            $('#new-dimension-name').focus();
            $('#new-dimension-name').on('focusout', () => {
                var tmpName = $('#new-dimension-name').val();
                if (typeof tmpName === 'string') {
                    dimName = tmpName;
                }
                else {
                    throw new TypeError(`dimName requires string, got${typeof tmpName}`);
                }

                for (var i = 0; i < this.ui.dimensions.length; i++) {
                    if (this.ui.dimensions[i].name === dimName) {
                        alert('Please select a unique name for this dimension');
                        setTimeout(() => {
                            $('#new-dimension-name').focus();
                        }, 100);
                        return;
                    }
                }

                dimension.name = dimName;


                //TODO: ensure name is unique

                nameDiv.remove();

                this.renderColorPicker(dimension.name);

                this.ui.contextMenu.dispose();
                this.preserveChanges(atom.workspace.getActiveTextEditor());
                this.updateEditorText();
                this.ui.contextMenu = atom.contextMenu.add({ 'atom-text-editor': [{ label: 'Insert Choice', submenu: this.ui.menuItems }] });

                this.ui.dimensions.push(dimension);

                // default new dimensions to show both branches
                this.ui.activeChoices.push({ name: dimension.name, status: 'BOTH' });
            });
        });
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

    //update the color of all matching dimensions in the document
    updateDimensionColor(dimension: DimensionUI) {
        this.ui.updateSession(dimension);
        for (var i = 0; i < this.doc.segments.length; i++) {
            this.changeDimColor(dimension, this.doc.segments[i]);
        }

        var preserver: EditPreserver = new EditPreserver(atom.workspace.getActiveTextEditor(), this.ui.activeChoices, this.ui.regionMarkers);
        preserver.visitDocument(this.doc);

        this.updateEditorText(); //TODO find a way to do this without rewriting everything in the editor
    }

    //change this node's color if appropriate, and recurse if necessary
    changeDimColor(dimension, node) {
        if (node.type == 'choice') {
            if (node.name == dimension.name) {
                node.color = dimension.color;
            }

            for (var i = 0; i < node.thenbranch.segments.length; i++) {
                this.changeDimColor(dimension, node.thenbranch.segments[i]);
            }
            for (var i = 0; i < node.elsebranch.segments.length; i++) {
                this.changeDimColor(dimension, node.elsebranch.segments[i]);
            }
        }
    }

    clearColors() {
        $("#dimension-color-styles").remove();
        this.styles = {}
    }

    serializeColors(): string {
        var css = '';
        for (var selector in this.styles) {
            css += selector + ` { ${this.styles[selector]}} \n`;
        }
        return css;
    }

    updateColors(doc: RegionNode) {
        this.clearColors();
        for (var i = 0; i < doc.segments.length; i++) {
            this.setColors(doc.segments[i]);
        }
        var css = this.serializeColors();
        $('head').append(`<style id='dimension-color-styles'>${css}</style>`);
    }

    setColors(node: SegmentNode): void {
        //if this is a dimension
        if (node.type === 'choice') {
            var color = this.ui.getColorForNode(node);

            var defbranchcolor = shadeColor(color, .1);
            var defbranchcursorcolor = shadeColor(color, .2);
            var defbranchhighlightcolor = shadeColor(color, .3);
            var ndefbranchcolor = shadeColor(color, -.3);
            var ndefbranchcursorcolor = shadeColor(color, -.2);
            var ndefbranchhighlightcolor = shadeColor(color, -.1);

            var selectors = [];
            var nestColors = [];

            if (this.nesting.length > 0) {
                for (var j = 0; j < this.nesting.length; j++) {
                    //nesting class format: 'nested-[DIM ID]-[BRANCH]-[LEVEL]'
                    selectors.push('.nested-' + this.nesting[j].selector.name + '-' + this.nesting[j].selector.status + '-' + j);
                    var status: DimensionStatus = this.nesting[j].selector.status;

                    //pre-shading nest color
                    var nestcolor = this.ui.getColorForNode(this.nesting[j].dimension);

                    //nest in the correct branch color
                    if (status === 'DEF') nestcolor = shadeColor(nestcolor, .1);
                    else nestcolor = shadeColor(nestcolor, -.3);

                    nestColors.push(nestcolor);
                }

                var selector = selectors.join('');
                //construct the nest gradient
                var x = 0;
                var increment = 1;
                var nestGradient = nestColors[0] + ' 0%';
                for (var j = 1; j < nestColors.length; j++) {
                    x = (j) * increment;
                    nestGradient = `${nestGradient}, ${nestColors[j]} ${x}%`;
                }

                //add the colors and borders as styles to our master list

                this.styles[`${selector}.${getdefbranchCssClass(node.name)}`] = `background: linear-gradient( 90deg, ${nestGradient}, ${defbranchcolor} ${x + increment}%);`;
                this.styles[`${selector}.${getdefbranchCssClass(node.name)}.cursor-line`] = `background: linear-gradient( 90deg, ${nestGradient}, ${defbranchcursorcolor} ${x + increment}%);`;
                this.styles[`${selector}.${getndefbranchCssClass(node.name)}`] = `background: linear-gradient( 90deg, ${nestGradient}, ${ndefbranchcolor} ${x + increment}%);`;
                this.styles[`${selector}.${getndefbranchCssClass(node.name)}.cursor-line`] = `background: linear-gradient( 90deg, ${nestGradient}, ${ndefbranchcursorcolor} ${x + increment}%);`;
                this.styles[`.hover-alt.${selector}.${getdefbranchCssClass(node.name)}`] = `background: linear-gradient( 90deg, ${nestGradient}, ${defbranchcolor} ${x + increment}%);`;
                this.styles[`.hover-alt.${selector}.${getndefbranchCssClass(node.name)}`] = `background: linear-gradient( 90deg, ${nestGradient}, ${ndefbranchcolor} ${x + increment}%);`;

            } else {
                this.styles[`.${getdefbranchCssClass(node.name)}`] = `background-color: ${defbranchcolor};`;
                this.styles[`.${getndefbranchCssClass(node.name)}`] = `background-color: ${ndefbranchcolor};`;
                this.styles[`.${getdefbranchCssClass(node.name)}.cursor-line.line`] = `background-color: ${defbranchcursorcolor};`;
                this.styles[`.${getndefbranchCssClass(node.name)}.cursor-line.line`] = ` background-color: ${ndefbranchcursorcolor};`;
                this.styles[`.${getdefbranchCssClass(node.name)}.line`] = `background-color: ${defbranchhighlightcolor};`;
                this.styles[`.${getndefbranchCssClass(node.name)}.highlight.line`] = ` background-color: ${ndefbranchhighlightcolor};`;
                this.styles[`.hover-alt.${getdefbranchCssClass(node.name)}`] = `background-color: ${defbranchcolor};`;
                this.styles[`.hover-alt.${getndefbranchCssClass(node.name)}`] = `background-color: ${ndefbranchcolor};`;
            }

            //recurse thenbranch and elsebranch
            var lselector: Selector = { name: node.name, status: (node.kind === 'positive') ? "DEF" : "NDEF" };
            this.nesting.push({ selector: lselector, dimension: node });
            //recurse on thenbranch and elsebranch
            for (var i = 0; i < node.thenbranch.segments.length; i++) {
                this.setColors(node.thenbranch.segments[i]);
            }
            this.nesting.pop();

            var rselector: Selector = { name: node.name, status: (node.kind === 'positive') ? "NDEF" : "DEF" }
            this.nesting.push({ selector: rselector, dimension: node });
            for (var i = 0; i < node.elsebranch.segments.length; i++) {
                this.setColors(node.elsebranch.segments[i]);
            }
            this.nesting.pop();
        }
    }

    updateSelections(selection: Selector) {
        for (let sel of this.ui.activeChoices) {
            if (sel.name === selection.name) {
                sel.status = selection.status;
                return;
            }
        }
        this.ui.activeChoices.push(selection);
    }

    // Generate a colorpicker for the dimension.
    renderColorPicker(dimensionName: string) {
        if (!this.ui.hasDimension(dimensionName)) {
            var previousSelection = false;
            for (var i = 0; i < this.ui.activeChoices.length; i++) {
                if (this.ui.activeChoices[i].name === dimensionName) {
                    previousSelection = true;
                    break;
                }
            }
            // default the selection to 'BOTH' if none has been made
            if (!previousSelection) this.ui.activeChoices.push({ name: dimensionName, status: 'BOTH' });

            var dimDiv = $(`<div class='form-group dimension-ui-div' id='${dimensionName}'>
  <input class='colorpicker' type='text' id="${dimensionName}-colorpicker">
  <h2>${dimensionName}</h2>
  <br>
  <div class="switch-toggle switch-3 switch-candy">

    <input id="${dimensionName}-view-both" name="state-${dimensionName}" type="radio" ${this.ui.shouldBeChecked('BOTH', dimensionName)} >
    <label for="${dimensionName}-view-both">BOTH</label>
    <br>
    <input id="${dimensionName}-view-thenbranch" name="state-${dimensionName}" type="radio" ${this.ui.shouldBeChecked('DEF', dimensionName)} >
    <label for="${dimensionName}-view-thenbranch">DEF</label>
    <br>
    <input id="${dimensionName}-view-elsebranch" name="state-${dimensionName}" type="radio" ${this.ui.shouldBeChecked('NDEF', dimensionName)} >
    <label for="${dimensionName}-view-elsebranch">NDEF</label>

  </div>
  <a href='' id='removeDimension-${dimensionName}' class='delete_icon'><img name='removeDimensionImg' border="0" src="${iconsPath}/delete-bin.png" width="16" height="18"/></a>
  <br>
</div>`);
            this.ui.main.append(dimDiv);

            //only hook up listeners, etc. once!
            $('#removeDimension-' + dimensionName).on("click", () => {
                this.removeDimension(dimensionName);
            });

            var menuItem = {
                label: dimensionName,
                submenu: [{
                    label: 'When Selected',
                    command: 'variational-editor:add-choice-segment-' + dimensionName + '-selected'
                },
                {
                    label: 'When Unselected',
                    command: 'variational-editor:add-choice-segment-' + dimensionName + '-unselected'
                }]
            }
            this.ui.menuItems.push(menuItem);

            var whenSelectedSub = {};
            whenSelectedSub[`variational-editor:add-choice-segment-${dimensionName}-selected`] = () => this.addChoiceSegment(dimensionName, "DEF");
            var whenUnselectedSub = {};
            whenUnselectedSub[`variational-editor:add-choice-segment-${dimensionName}-unselected`] = () => this.addChoiceSegment(dimensionName, "NDEF");

            this.subscriptions.add(atom.commands.add('atom-text-editor', whenSelectedSub));
            this.subscriptions.add(atom.commands.add('atom-text-editor', whenUnselectedSub));

            var dimUIElement = this.ui.setupColorPickerForDim(dimensionName);

            dimUIElement.colorpicker.on('change', () => {
                var rgba = dimUIElement.colorpicker.spectrum('get').toRgbString();
                dimUIElement.color = rgba;

                this.updateDimensionColor(dimUIElement);
            });

            this.addViewListeners(dimUIElement);
        }
    }

    decorateDimension(editor: TextEditor, node: ChoiceNode, branch: Branch): void {
        const otherBranch = branch === 'thenbranch' ? 'elsebranch' : 'thenbranch';

        if (isBranchActive(node, getSelectionForNode(node, this.ui.activeChoices), branch) && node[branch].segments.length > 0 && !node[branch].hidden) {
            //add markers for this new range of a (new or pre-existing) dimension
            var branchMarker = editor.markBufferRange(node[branch].span, { invalidate: 'surround' });
            this.ui.regionMarkers.push(branchMarker);

            // Decorate with the appropriate css classes.
            // Note: The use of positive and negative here is unrelated to
            //       the positive and negative relation of DEF and NDEF.
            let positiveCssClass: (any) => string, negativeCssClass: (any) => string;
            let positiveDef: DimensionStatus, negativeDef: DimensionStatus;
            let spanPos: string, markerPos: 'before' | 'after';
            if (branch === 'thenbranch') {
                positiveCssClass = getdefbranchCssClass;
                negativeCssClass = getndefbranchCssClass;
                positiveDef = 'DEF';
                negativeDef = 'NDEF';
                spanPos = 'end';
                markerPos = 'after';
            }
            else {
                positiveCssClass = getndefbranchCssClass;
                negativeCssClass = getdefbranchCssClass;
                positiveDef = 'NDEF';
                negativeDef = 'DEF';
                spanPos = 'start';
                markerPos = 'before';
            }

            editor.decorateMarker(branchMarker, { type: 'line', class: node.kind === 'positive' ? positiveCssClass(node.name) : negativeCssClass(node.name) });
            branchMarker.onDidDestroy(() => {
                this.preserveChanges(editor);
                this.updateEditorText();
            });

            var element = document.createElement('div');

            for (var i = this.nesting.length - 1; i >= 0; i--) {
                //nesting class format: 'nested-[DIM ID]-[STATUS]-[LEVEL]'
                var nestclass = 'nested-' + this.nesting[i].selector.name + '-' + this.nesting[i].selector.status + '-' + i;
                editor.decorateMarker(branchMarker, { type: 'line', class: nestclass });
                element.classList.add(nestclass);
            }

            if (node[otherBranch].segments.length == 0 && node[otherBranch].hidden == false) {
                element.textContent = '(+)';
                element.classList.add(`insert-alt-${node.name}`);
                element.classList.add(`insert-alt`);
                element.classList.add(node.kind === 'positive' ? negativeCssClass(node.name) : positiveCssClass(node.name));

                var hiddenMarker = editor.markBufferPosition(node[branch].span[spanPos]);
                this.ui.markers.push(hiddenMarker);
                editor.decorateMarker(
                    hiddenMarker,
                    {
                        type: 'block',
                        position: markerPos,
                        item: element
                    });

                var veditor = this;
                element.onclick = () => {
                    veditor.preserveChanges(editor);
                    var newNode: ContentNode = {
                        type: "text",
                        content: branch === 'thenbranch' ? '\n\n' : '\n'
                    };
                    var inserter = new AlternativeInserter(newNode, branchMarker.getBufferRange()[spanPos], otherBranch, node.name);
                    veditor.doc = inserter.rewriteDocument(veditor.doc);
                    veditor.updateEditorText();
                };
            } else if (node[otherBranch].hidden && node[otherBranch].segments.length > 0) {
                element.textContent = '(...)';
                element.classList.add(`hover-alt-${node.name}`);
                element.classList.add(`hover-alt`);
                element.classList.add(node.kind === 'positive' ? negativeCssClass(node.name) : positiveCssClass(node.name));
                this.popupListenerQueue.push({ element: element, text: renderDocument(node[otherBranch]) });

                var hiddenMarker = editor.markBufferPosition(node[branch].span[spanPos]);
                this.ui.markers.push(hiddenMarker);
                editor.decorateMarker(hiddenMarker, { type: 'block', position: markerPos, item: element });
                element.onclick = () => { $(`#${node.name}-view-both`).click(); };
            }

            this.nesting.push({ selector: { name: node.name, status: (node.kind === 'positive') ? positiveDef : negativeDef }, dimension: node });
            // Recurse on child branches.
            for (var i = 0; i < node[branch].segments.length; i++) {
                this.renderDimensionUI(editor, node[branch].segments[i]);
            }
            this.nesting.pop();
        }
    }

    //using the list of dimensions contained within the ui object,
    //add html elements, markers, and styles to distinguish dimensions for the user
    renderDimensionUI(editor: TextEditor, node: SegmentNode) {
        //if this is a dimension
        if (node.type === "choice") {
            this.renderColorPicker(node.name);
            this.decorateDimension(editor, node, 'thenbranch');
            this.decorateDimension(editor, node, 'elsebranch');
        } else {
            var m = editor.markBufferRange(node.span, { invalidate: 'surround' });
            this.ui.markers.push(m);
            node.marker = m;
        }
    }

    removeDimension(dimName: string) {
        var sure = confirm('Are you sure you want to remove this dimension? Any currently \
              visible code in this dimension will be promoted. Any hidden code will be removed.')

        if (sure) {
            //find the dimension and remove it
            for (var i = 0; i < this.ui.dimensions.length; i++) {
                if (this.ui.dimensions[i].name === dimName) {
                    this.ui.dimensions.splice(i, 1);
                    $("#" + dimName).remove();
                }
            }
            var selection: Selector = getSelectionForDim(dimName, this.ui.activeChoices);
            this.deleteDimension(selection);
            this.updateEditorText();
        } else {
            return;
        }
    }

    // Thenbranch and elsebranch represent whether the thenbranch and elsebranch
    // branches should be promoted. A value of 'true' indicates that the content
    // in that branch should be promoted.
    deleteDimension(selection: Selector) {
        //if this is the dimension being promoted, then do that
        this.preserveChanges(atom.workspace.getActiveTextEditor());
        var deleter = new DimensionDeleter(selection);
        this.doc = deleter.rewriteRegion(this.doc);
        this.updateEditorText();
        for (var i = 0; i < this.ui.menuItems.length; i++) {
            if (this.ui.menuItems[i].label === selection.name) {
                this.ui.menuItems.splice(i, 1);
            }
        }
        this.ui.contextMenu.dispose();
        this.ui.contextMenu = atom.contextMenu.add({ 'atom-text-editor': [{ label: 'Insert Choice', submenu: this.ui.menuItems }] });
    }

    deleteBranch(region: RegionNode, editor: TextEditor) {
        for (let segment of region.segments) {
            if (segment.type === 'choice') {
                this.deleteBranch(segment.thenbranch, editor);
                this.deleteBranch(segment.elsebranch, editor);
            } else {
                editor.setTextInBufferRange(segment.marker.getBufferRange(), '');
            }
        }
    }

    preserveChanges(editor: TextEditor): boolean {
        var preserver: EditPreserver = new EditPreserver(editor, this.ui.activeChoices, this.ui.regionMarkers);
        return preserver.visitDocument(this.doc);
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
            this.doc = JSON.parse(data);
            next();
        });

        parserProcess.stdin.write(textContents);
        parserProcess.stdin.end();
    }

    setDimension(dimName: string, status: DimensionStatus) {
        var editor = atom.workspace.getActiveTextEditor();
        this.preserveChanges(editor);
        for (var i = 0; i < this.ui.activeChoices.length; i++) {
            if (this.ui.activeChoices[i].name === dimName) {
                this.ui.activeChoices[i].status = status;
            }
        }

        this.updateEditorText();
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

    updateEditorText() {
        var editor = atom.workspace.getActiveTextEditor();
        var showDoc = new ViewRewriter(this.ui.activeChoices).rewriteDocument(this.doc);
        this.lastShowDoc = showDoc;
        editor.setText(renderDocument(showDoc));

        for (var marker of this.ui.markers) {
            marker.destroy();
        }
        this.ui.markers = [];
        this.ui.regionMarkers = [];

        this.tooltips.dispose();

        for (var i = 0; i < showDoc.segments.length; i++) {
            this.renderDimensionUI(editor, showDoc.segments[i]);
        }

        for (var popup of this.popupListenerQueue) {
            this.tooltips.add(atom.tooltips.add(popup.element, { title: popup.text }));
        }
        this.popupListenerQueue = [];

        this.updateColors(showDoc);
    }

    activate(state) {
        this.state = "unparsed"
        this.ui = new VariationalEditorView(state);

        this.nesting = [];
        this.ui.menuItems = [];
        this.popupListenerQueue = [];
        this.subscriptions = new CompositeDisposable();
        this.tooltips = new CompositeDisposable();

        // Register command that toggles veditor view
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'variational-editor:toggle': () => this.toggle()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'variational-editor:undo': () => this.noUndoForYou()
        }));

        const editor = atom.workspace.getActiveTextEditor();

        atom.views.getView(editor).addEventListener("keyup", (event) => { this.KeyUpCheck(event); });
        atom.views.getView(editor).addEventListener("keydown", (event) => { this.KeyDownCheck(event); });
    }

    // Currently `event` isn't used, but it's required because the event
    // listener passes an event to this function. For now ignore any typescript
    // warnings about its value never being read.
    KeyDownCheck(event) {
        if (this.state === "parsed") {
            //make note of the last cursor position so we can use it on keyup
            var activeEditor = atom.workspace.getActiveTextEditor();
            var location = activeEditor.getCursorBufferPosition();
            this.lastCursorLocation = location;
        }
    }

    KeyUpCheck(event) {
        var KeyID = event.keyCode;
        if (this.state === "parsed") {
            switch (KeyID) {
                case 8:
                    //nobackspaceforyou
                    var searcher = new ASTSearcher(this.lastShowDoc);
                    var activeEditor = atom.workspace.getActiveTextEditor();
                    if (searcher.isLocationAtStartOfSpan(this.lastCursorLocation)) {
                        this.updateEditorText();
                        activeEditor.setCursorBufferPosition(this.lastCursorLocation);
                    }
                    break;
                case 46:
                    //nodeleteforyou
                    var searcher = new ASTSearcher(this.lastShowDoc);
                    var activeEditor = atom.workspace.getActiveTextEditor();
                    if (searcher.isLocationAtEndOfSpan(this.lastCursorLocation)) {
                        this.updateEditorText();
                        activeEditor.setCursorBufferPosition(this.lastCursorLocation);
                    }
                    break;
                default: //if someone pressed another key besides backspace or delete, just preserve their change
                    break;
            }
            setTimeout(() => {
                var activeEditor = atom.workspace.getActiveTextEditor();
                var location = activeEditor.getCursorBufferPosition();
                this.lastCursorLocation = location;

                if (this.preserveChanges(activeEditor)) {
                    this.updateEditorText();
                    activeEditor.setCursorBufferPosition(this.lastCursorLocation);
                }
            }, 20);


        }
    }

    getOriginalPath(path: string): string {
        var pathBits = path.split('-temp-veditor'); //TODO is there a way to make this not a magic reserved file name?
        var originalPath = pathBits.splice(0, pathBits.length).join('');
        return originalPath;
    }

    handleDidSave(event: { path: string }) {
        var activeEditor = atom.workspace.getActiveTextEditor();
        var originalPath = this.getOriginalPath(event.path);

        this.preserveChanges(activeEditor);
        fs.writeFile(originalPath, docToPlainText(this.doc), function(err) {
            if (err) {
                return console.log(err);
            }
        });

    }

    noUndoForYou() {
        if (this.state === "parsed") return;
        atom.commands.dispatch(atom.views.getView(atom.workspace.getActiveTextEditor()), "core:undo");
    }

    deactivate() {
    }

    serialize() {
        var dims = [];
        for (var dimension of this.ui.dimensions) {
            dims.push({ color: dimension.color, name: dimension.name, colorpicker: null })
        }
        var ses = [];
        for (var dimension of this.ui.session) {
            ses.push({ color: dimension.color, name: dimension.name, colorpicker: null })
        }
        return { session: ses, dimensions: dims, activeChoices: this.ui.activeChoices };
    }

    addChoiceSegment(dim: string, status: DimensionStatus) {
        if (this.addChoiceLockout) return;
        this.addChoiceLockout = true;
        var activeEditor = atom.workspace.getActiveTextEditor();


        var lit = 'new dimension';

        //we have to grab the zero index for some stupid reason
        var location = activeEditor.getCursorBufferPosition();

        var node: ChoiceNode = {
            span: null, // we don't know what it's span will be
            name: dim,
            kind: status === 'DEF' ? 'positive' : 'contrapositive', // NOTE that in this case, status must either be 'DEF' or 'NDEF',
            // and in fact cannot be 'BOTH' (enforced only by convention at usage sites)
            type: 'choice',
            thenbranch: { segments: [], type: "region" },
            elsebranch: { segments: [], type: "region" }
        }

        node.thenbranch.segments = [
            {
                span: null, //no idea what this will be
                marker: null,// do this later?
                content: '\n' + lit + '\n',
                type: 'text'
            }
        ];

        this.preserveChanges(activeEditor);
        var inserter = new NodeInserter(node, location, activeEditor);
        this.doc = inserter.rewriteDocument(this.doc);
        this.updateEditorText();
        setTimeout(() => { this.addChoiceLockout = false }, 500);
    }

    toggle() {
        var activeEditor = atom.workspace.getActiveTextEditor();
        if (this.state === "parsed") {
            this.state = "unparsed"
            this.preserveChanges(activeEditor);
            this.ui.panel.destroy();
            this.ui.dimensions = [];
            this.ui.menuItems = [];

            for (var marker of this.ui.markers) {
                marker.destroy();
            }
            this.ui.markers = [];

            var tempPath = activeEditor.getPath();
            this.saveSubscription.dispose();
            activeEditor.setText(docToPlainText(this.doc));
            activeEditor.saveAs(this.getOriginalPath(activeEditor.getPath()));
            fs.unlink(tempPath, function(err) {
                if (err) console.log(err);
            });
            this.ui.contextMenu.dispose();
        } else {
            this.state = "parsed"
            var contents = activeEditor.getText();

            //parse the file
            this.parseVariation(contents, () => {


                this.ui.dimensions = [];

                this.createUI();

                this.updateEditorText();
                //set up context menu here
                this.ui.contextMenu = atom.contextMenu.add({ 'atom-text-editor': [{ label: 'Insert Choice', submenu: this.ui.menuItems }] });

                //preserve the contents for later comparison (put, get)
                this.raw = contents;

                this.ui.panel.show();

                var pathBits = activeEditor.getPath().split('.');
                activeEditor.saveAs(pathBits.splice(0, pathBits.length - 1).join('.') + '-temp-veditor.' + pathBits[pathBits.length - 1]);

                this.saveSubscription = activeEditor.onDidSave(this.handleDidSave.bind(this));
            });
        }
    }

};

export default new VariationalEditor();
