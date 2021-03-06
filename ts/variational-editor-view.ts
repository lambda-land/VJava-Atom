'use babel';
import $ from 'jquery';
import path from 'path';

import { BranchCondition, defbranch, ndefbranch } from './dimension-decoration-manager';


export type DimensionStatus = "DEF" | "NDEF" | "BOTH"

export interface DimensionUI {
    name: string;
    color: string;
    colorpicker?: JQuery;
    element: JQuery;
    visible: boolean;
}

export type Branch = "thenbranch" | "elsebranch";

const iconsPath = path.resolve(
    atom.packages.resolvePackagePath("variational-editor-atom"),
    "icons"
);

// Handles actions for the sidebar.
export class VariationalEditorView {
    main: JQuery;
    private onChooseChoiceCb: (dimension: string, c: BranchCondition) => any;
    private onColorChangeCb: () => any;
    panelMenus: { [dimension: string]: DimensionUI };
    secondary: JQuery;
    sidePanel: JQuery;

    constructor(state = {}) {
        this.sidePanel = $('<div id="variationalEditorSidePanel" style="overflow-y:auto;"></div>');
        // this.main holds the spectrum colorpickers.
        this.main = $('<div id="variationalEditorUI"></div>');
        this.sidePanel.append(this.main);

        // this.secondary holds the buttons.
        this.secondary = $(`<div id="variationalEditorUIButtons" class="veditor-secondary">
</div>`);
        this.sidePanel.append(this.secondary);

        // References the individual panels for each dimension.
        this.panelMenus = {};

        for (let dimension in state) {
            this.createPanelMenu(dimension, state[dimension]);
        }
    }

    serialize() {
        const colors: { [dimension: string]: string } = {};
        for (let dimension in this.panelMenus) {
            const menu = this.panelMenus[dimension];
            colors[menu.name] = menu.color;
        }
        return colors;
    }

    destroy(): void {
        this.sidePanel.remove();
    }

    // Create a new dimension panel.
    createPanelMenu(name: string, color?: string) {
        // TODO: Select unique default colors.
        const dimensionColor: string = color ? color : 'rgb(127, 71, 62)';

        if (!this.hasPanelMenu(name)) {
            // Create a new panel menu for dimension.
            this.panelMenus[name] = {
                name: name,
                color: dimensionColor,
                colorpicker: null,
                element: null,
                visible: true,
            };
            const panelMenu = this.panelMenus[name];

            // Create the HTML that represents the panel.
            const idBoth: string = `${name}-view-both`;
            const idDef: string = `${name}-view-defbranch`;
            const idNDef: string = `${name}-view-ndefbranch`;
            const element: JQuery = $(`<div class='form-group dimension-ui-div' id='${name}'>
  <input class='colorpicker' type='text' id="${name}-colorpicker">
  <h2>${name}</h2>
  <br>
  <div class="switch-toggle switch-3 switch-candy">
    <input id="${idBoth}" name="state-${name}" type="radio" value="BOTH" checked>
    <label for="${idBoth}">BOTH</label>
    <br>
    <input id="${idDef}" name="state-${name}" type="radio" value="DEF" >
    <label for="${idDef}">DEF</label>
    <br>
    <input id="${idNDef}" name="state-${name}" type="radio" value="NDEF" >
    <label for="${idNDef}">NDEF</label>
  </div>
  <a href='' id='removeDimension-${name}' class='delete_icon'><img name='removeDimensionImg' border="0" src="${iconsPath}/delete-bin.png" width="16" height="18"></a>
  <br>
</div>`);
            const colorPicker = element.find(`#${name}-colorpicker`);

            panelMenu.element = element;
            panelMenu.colorpicker = colorPicker;

            // Attach the spectrum colorpicker to the panel and the handler for
            // when the color changes.
            panelMenu.colorpicker.spectrum({
                color: panelMenu.color,
                preferredFormat: 'rgb'
            }).on('change', () => {
                panelMenu.color = panelMenu.colorpicker.spectrum('get').toRgbString();
                this.onColorChangeCb();
            });

            // Attach handlers for when a radio button is clicked.
            panelMenu.element.find(`#${idBoth}`).on('click', () => {
                this.onChooseChoiceCb(name, null)
            });
            panelMenu.element.find(`#${idDef}`).on('click', () => {
                this.onChooseChoiceCb(name, defbranch)
            });
            panelMenu.element.find(`#${idNDef}`).on('click', () => {
                this.onChooseChoiceCb(name, ndefbranch)
            });

            this.main.append(element);
        }
        else {
            // Make sure the panel is visible.
            const panelMenu = this.getPanelMenu(name);
            if (!panelMenu.visible) {
                this.main.append(panelMenu.element);
                panelMenu.visible = true;
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

    getDimensionColor(name: string): string {
        if (!this.hasPanelMenu(name)) {
            throw new Error(`Dimension ${name} doesn't exist; cannot get color`);
        }
        return this.panelMenus[name].color;
    }

    // Get selected branch condition from panel menu for dimension.
    getVisibleChoice(dimension: string): BranchCondition | null {
        const panelMenu = this.getPanelMenu(dimension);
        const status: DimensionStatus = panelMenu.element
            .find(`input[name=state-${panelMenu.name}]:checked`)
            .val() as DimensionStatus;

        // Cannot statically guarantee JQuery object will return a
        // DimensionStatus string, so use a run time check.
        if (['BOTH', 'DEF', 'NDEF'].indexOf(status as string) == -1) {
            throw new Error(
                `Dimension ${panelMenu.name} has invalid DimensionStatus: ${status}`);
        }

        if (status == 'BOTH') {
            return null;
        }
        if (status == 'DEF') {
            return defbranch;
        }
        if (status == 'NDEF') {
            return ndefbranch;
        }
    }

    onColorChange(cb: () => any): void {
        this.onColorChangeCb = cb;
    }

    onChooseChoice(cb: (dimension: string, c: BranchCondition) => any): void {
        this.onChooseChoiceCb = cb;
    }

    // Unmark all panel menus.
    unmark(): void {
        Object.keys(this.panelMenus).forEach(key => {
            this.panelMenus[key].visible = false;
        });
    }

    // Remove all panel menus that shouldn't be visible from the side panel.
    sweep(): void {
        Object.keys(this.panelMenus).forEach(key => {
            if (!this.panelMenus[key].visible) {
                this.panelMenus[key].element.detach();
            }
        });
    }
}
