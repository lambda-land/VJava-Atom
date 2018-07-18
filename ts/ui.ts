'use babel';
import { DisplayMarker, Panel } from 'atom'
import $ from 'jquery'

import { ChoiceNode } from './ast'

export class NestLevel {
    selector: Selector
    dimension: ChoiceNode
}

export type DimensionStatus = "DEF" | "NDEF" | "BOTH"

export class Selector {
    name: string
    status: DimensionStatus
}

export interface Disposable {
    dispose(): any
}

export interface MenuItem {
    label: string
    submenu?: MenuItem[]
    command?: string
}

export type Branch = "thenbranch" | "elsebranch";

export class VJavaUI {
    panel: Panel;
    session: DimensionUI[];
    dimensions: DimensionUI[];
    main: JQuery;
    secondary: JQuery;
    message: JQuery;
    activeChoices: Selector[];
    markers: DisplayMarker[];
    regionMarkers: DisplayMarker[];
    contextMenu: Disposable;
    menuItems: MenuItem[]


    constructor({ panel = null, session = [], dimensions = [], activeChoices = [], markers = [] }) {
        this.panel = panel;
        this.session = session;
        this.dimensions = dimensions; //TODO do we really need a session and a list of dimensions? are they the same?
        this.activeChoices = activeChoices;
        this.markers = markers;
    }

    serialize() {
        return {
            data: {
                panel: this.panel, session: this.session, dimensions: this.dimensions,
                activeChoices: this.activeChoices, markers: this.markers
            }, deserializer: "VJavaUI"
        };
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

export interface DimensionUI {
    name: string;
    color: string;
    colorpicker?: JQuery;
}
