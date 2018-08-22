'use babel';
import { DisplayMarker, Disposable, Panel, Range, TextEditor } from 'atom'
import $ from 'jquery'
import path from 'path';

import { ChoiceNode, RegionNode, SegmentNode } from './ast'


// Extend atom interfaces.
declare module 'atom' {
    export interface StyleManager {
        // This method is not documented in Atom's public API. This method
        // can be found in `src/style-manager.js` in Atom's GitHub.
        addStyleSheet(source: string, params?: any): Disposable;
    }
}

export class NestLevel {
    selector: Selector
    dimension: ChoiceNode
}

export type DimensionStatus = "DEF" | "NDEF" | "BOTH"

export interface DimensionUI {
    name: string;
    color: string;
    colorpicker?: JQuery;
    element: JQuery;
}

export class Selector {
    name: string
    status: DimensionStatus
}

export interface MenuItem {
    label: string
    submenu?: MenuItem[]
    command?: string
}

export type Branch = "thenbranch" | "elsebranch";

const iconsPath = path.resolve(
    atom.packages.resolvePackagePath("variational-editor-atom"),
    "icons"
);

function getdefbranchCssClass(dimName: string): string {
    return 'dimension-marker-' + dimName + "-defbranch";
}

function getndefbranchCssClass(dimName: string): string {
    return 'dimension-marker-' + dimName + "-ndefbranch";
}

export class VariationalEditorView {
    activeChoices: Selector[];
    contextMenu: Disposable;
    panelMenus: { [dimension: string]: DimensionUI };
    main: JQuery;
    markers: DisplayMarker[];
    menuItems: MenuItem[]
    message: JQuery;
    nesting: NestLevel[];
    panel: Panel;
    secondary: JQuery;
    session: DimensionUI[];
    sidePanel: JQuery;
    styles: { [selector: string]: string } = {}
    regionMarkers: DisplayMarker[];

    constructor({ panel = null, session = [], dimensions = {}, activeChoices = [], markers = [] }) {
        this.panel = panel;
        this.session = session;
        this.panelMenus = dimensions; //TODO do we really need a session and a list of dimensions? are they the same?
        this.activeChoices = activeChoices;
        this.markers = markers;
        this.nesting = [];
        this.sidePanel = $('<div id="variationalEditorSidePanel"></div>');
        // this.main holds the spectrum colorpickers.
        this.main = $('<div id="variationalEditorUI"></div>');
        this.sidePanel.append(this.main);

        // this.secondary holds the buttons.
        this.secondary = $(`<div id="variationalEditorUIButtons" class="veditor-secondary">
</div>`);
        this.sidePanel.append(this.secondary);
    }

    serialize() {
        return {
            data: {
                panel: this.panel, session: this.session, dimensions: this.panelMenus,
                activeChoices: this.activeChoices, markers: this.markers
            }, deserializer: "VariationalEditorView"
        };
    }

    destroy(): void {
        this.sidePanel.remove();
    }

    addMarker(node: ChoiceNode) {
        const dimension: DimensionUI = this.getPanelMenu(node.name);
        const editor: TextEditor = atom.workspace.getActiveTextEditor();

        let thenBranchCssClass: string, elseBranchCssClass: string;
        if (node.kind === 'positive') {
            thenBranchCssClass = getdefbranchCssClass(node.name);
            elseBranchCssClass = getndefbranchCssClass(node.name);
        }
        else {
            thenBranchCssClass = getndefbranchCssClass(node.name);
            elseBranchCssClass = getdefbranchCssClass(node.name);
        }

        const elseBranch: boolean = node.elsebranch.segments.length > 0;

        let thenBranchMarker: DisplayMarker, elseBranchMarker: DisplayMarker;
        if (!elseBranch) {
            thenBranchMarker = editor.markBufferRange(
                node.span,
                { invalidate: 'never' });
        }
        else {
            thenBranchMarker = editor.markBufferRange(
                node.thenbranch.span,
                { invalidate: 'never' });

            // Add 1 to the column to account for the #endif statement.
            const elseRange: Range = new Range(
                node.elsebranch.span.start,
                [node.elsebranch.span.end[0] + 1, node.elsebranch.span.end[1]]);
            elseBranchMarker = editor.markBufferRange(
                elseRange,
                { invalidate: 'never' });
        }

        editor.decorateMarker(
            thenBranchMarker,
            {
                type: 'line',
                class: thenBranchCssClass
            });

        if (elseBranch) {
            editor.decorateMarker(
                elseBranchMarker,
                {
                    type: 'line',
                    class: elseBranchCssClass
                });
        }
    }

    createPanelMenu(name: string) {
        if (!this.hasPanelMenu(name)) {
            this.panelMenus[name] = {
                name: name,
                color: 'rgb(127, 71, 62)',
                colorpicker: null,
                element: null
            };
            const panelMenu = this.panelMenus[name];
            const element = $(`<div class='form-group dimension-ui-div' id='${name}'>
  <input class='colorpicker' type='text' id="${name}-colorpicker">
  <h2>${name}</h2>
  <br>
  <div class="switch-toggle switch-3 switch-candy">
    <input id="${name}-view-both" name="state-${name}" type="radio" ${this.shouldBeChecked('BOTH', name)}>
    <label for="${name}-view-both">BOTH</label>
    <br>
    <input id="${name}-view-thenbranch" name="state-${name}" type="radio" ${this.shouldBeChecked('DEF', name)}>
    <label for="${name}-view-thenbranch">DEF</label>
    <br>
    <input id="${name}-view-elsebranch" name="state-${name}" type="radio" ${this.shouldBeChecked('NDEF', name)}>
    <label for="${name}-view-elsebranch">NDEF</label>
  </div>
  <a href='' id='removeDimension-${name}' class='delete_icon'><img name='removeDimensionImg' border="0" src="${iconsPath}/delete-bin.png" width="16" height="18"></a>
  <br>
</div>`);
            const colorPicker = element.find(`#${name}-colorpicker`);

            panelMenu.element = element;
            panelMenu.colorpicker = colorPicker;

            panelMenu.colorpicker.spectrum({
                color: panelMenu.color,
                preferredFormat: 'rgb'
            }).on('change', () => {
                panelMenu.color = panelMenu.colorpicker.spectrum('get').toRgbString();
            });
            this.main.append(element);
        }
    }

    createPanelMenuItems(node: SegmentNode | RegionNode): void {
        if (node.type === 'choice') {
            this.createPanelMenu(node.name);
            this.createPanelMenuItems(node.thenbranch);
            this.createPanelMenuItems(node.elsebranch);
        }
        else if (node.type === 'region') {
            for (let segment of node.segments) {
                this.createPanelMenuItems(segment);
            }
        }
    }

    getPanelMenu(name: string): DimensionUI {
        if (!this.hasPanelMenu(name)) {
            throw new Error(`Dimension ${name} doesn't exist`);
        }
        return this.panelMenus[name];
    }

    hasPanelMenu(name: string): boolean {
        return this.panelMenus.hasOwnProperty(name);
    }

    sessionColorFor(name: string): string {
        for (let dim of this.session) {
            if (dim.name === name) return dim.color;
        }
        return 'none';
    }

    updateSession(dimension: DimensionUI) {
        for (let i = 0; i < this.session.length; i++) {
            const dim = this.session[i];
            if (dim.name === dimension.name) {
                this.session[i] = dimension
                return;
            }
        }
        this.session.push(dimension);
    }

    getDimensionColor(name: string): string {
        if (!this.hasPanelMenu(name)) {
            throw new Error(`Dimension ${name} doesn't exist; cannot get color`);
        }
        return this.panelMenus[name].color;
    }

    getSelector(dimName: string): Selector {
        for (const choice of this.activeChoices) {
            if (choice.name === dimName) return choice;
        }
        return null;
    }

    shouldBeChecked(dimStatus: DimensionStatus, dimName: string): string {
        const selector = this.getSelector(dimName);
        if (dimStatus === 'DEF') {
            return (selector && selector.status === dimStatus) ? 'checked' : ''
        } else if (dimStatus === 'NDEF') {
            return (selector && selector.status === dimStatus) ? 'checked' : ''
        } else if (dimStatus === 'BOTH') {
            return (!selector || selector.status === dimStatus) ? 'checked' : ''
        }
    }
}
