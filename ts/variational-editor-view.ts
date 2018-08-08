'use babel';
import { DisplayMarker, Disposable, Panel } from 'atom'
import $ from 'jquery'
import path from 'path';

import { ChoiceNode } from './ast'

export class NestLevel {
    selector: Selector
    dimension: ChoiceNode
}

export type DimensionStatus = "DEF" | "NDEF" | "BOTH"

export interface DimensionUI {
    name: string;
    color: string;
    colorpicker?: JQuery;
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

var iconsPath = path.resolve(atom.packages.resolvePackagePath("variational-editor-atom"),
    "icons");

export class VariationalEditorView {
    activeChoices: Selector[];
    contextMenu: Disposable;
    dimensions: DimensionUI[];
    main: JQuery;
    markers: DisplayMarker[];
    menuItems: MenuItem[]
    message: JQuery;
    panel: Panel;
    secondary: JQuery;
    session: DimensionUI[];
    sidePanel: JQuery;
    regionMarkers: DisplayMarker[];

    constructor({ panel = null, session = [], dimensions = [], activeChoices = [], markers = [] }) {
        this.panel = panel;
        this.session = session;
        this.dimensions = dimensions; //TODO do we really need a session and a list of dimensions? are they the same?
        this.activeChoices = activeChoices;
        this.markers = markers;
        this.sidePanel = $('<div></div>');
        // this.main holds the spectrum colorpickers.
        this.main = $('<div id="variationalEditorUI"></div>');
        this.sidePanel.append(this.main);

        // this.secondary holds the buttons.
        this.secondary = $(`<div id="variationalEditorUIButtons" class="veditor-secondary">
  <a href='' id='addNewDimension'>
    <img id='addNewDimensionImg' border="0" src="${iconsPath}/add_square_button.png" width="30" height="30">
  </a>
</div>`);
        this.sidePanel.append(this.secondary);
    }

    serialize() {
        return {
            data: {
                panel: this.panel, session: this.session, dimensions: this.dimensions,
                activeChoices: this.activeChoices, markers: this.markers
            }, deserializer: "VariationalEditorView"
        };
    }

    createColorPicker(name: string) {
        this.main.append($(`<div class='form-group dimension-ui-div' id='${name}'>
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
</div>`));
    }

    hasDimension(name: string): boolean {
        for (let dim of this.dimensions) {
            if (dim.name === name) return true;
        }
        return false;
    }

    sessionColorFor(name: string): string {
        for (let dim of this.session) {
            if (dim.name === name) return dim.color;
        }
        return 'none';
    }

    updateSession(dimension: DimensionUI) {
        for (var i = 0; i < this.session.length; i++) {
            var dim = this.session[i];
            if (dim.name === dimension.name) {
                this.session[i] = dimension
                return;
            }
        }
        this.session.push(dimension);
    }

    getColorForNode(node: ChoiceNode): string {
        var color;
        //next try the session color set
        var sessionColor: string = this.sessionColorFor(node.name);
        if (this.hasDimension(node.name)) {
            for (var dim of this.dimensions) {
                if (dim.name === node.name) {
                    color = dim.color;
                }
            }
        } else {
            if (sessionColor != 'none') {
                this.dimensions.push({ name: node.name, color: sessionColor, colorpicker: null })
                color = sessionColor;
            } else {
                this.dimensions.push({ name: node.name, color: 'rgb(127, 71, 62)', colorpicker: null })
                color = 'rgb(127, 71, 62)';
            }
        }
        return color;
    }

    getColorForDim(dimName: string) {
        var color;
        //next try the session color set
        var sessionColor: string = this.sessionColorFor(dimName);
        if (this.hasDimension(dimName)) {
            for (var dim of this.dimensions) {
                if (dim.name === dimName) {
                    color = dim.color;
                }
            }
        } else {
            if (sessionColor != 'none') {
                this.dimensions.push({ name: dimName, color: sessionColor, colorpicker: null })
                color = sessionColor;
            } else {
                this.dimensions.push({ name: dimName, color: 'rgb(127, 71, 62)', colorpicker: null })
                color = 'rgb(127, 71, 62)';
            }
        }
        return color;
    }

    setupColorPickerForDim(dimName: string): DimensionUI {
        var dimUIElement;
        var color = this.getColorForDim(dimName);
        dimUIElement = this.getDimUIElementByName(dimName);
        dimUIElement.colorpicker = $(`#${dimName}-colorpicker`).spectrum({
            color: color,
            preferredFormat: 'rgb'
        });
        return dimUIElement;

    }

    getDimUIElementByName(name: string): DimensionUI {
        for (var dim of this.dimensions) {
            if (dim.name === name) return dim;
        }
    }

    getSelector(dimName: string): Selector {
        for (let choice of this.activeChoices) {
            if (choice.name === dimName) return choice;
        }
        return null;
    }

    shouldBeChecked(dimStatus: DimensionStatus, dimName: string) {
        var selector = this.getSelector(dimName);
        if (dimStatus === 'DEF') {
            return (selector && selector.status === dimStatus) ? 'checked' : ''
        } else if (dimStatus === 'NDEF') {
            return (selector && selector.status === dimStatus) ? 'checked' : ''
        } else if (dimStatus === 'BOTH') {
            return (!selector || selector.status === dimStatus) ? 'checked' : ''
        }
    }
}
