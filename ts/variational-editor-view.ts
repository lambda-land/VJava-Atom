'use babel';
import $ from 'jquery';
import path from 'path';


export type DimensionStatus = "DEF" | "NDEF" | "BOTH"

export interface DimensionUI {
    name: string;
    color: string;
    colorpicker?: JQuery;
    element: JQuery;
}

export type Branch = "thenbranch" | "elsebranch";

const iconsPath = path.resolve(
    atom.packages.resolvePackagePath("variational-editor-atom"),
    "icons"
);

export class VariationalEditorView {
    main: JQuery;
    onColorChangeCb: () => any;
    panelMenus: { [dimension: string]: DimensionUI };
    secondary: JQuery;
    sidePanel: JQuery;

    constructor(state = {}) {
        this.sidePanel = $('<div id="variationalEditorSidePanel"></div>');
        // this.main holds the spectrum colorpickers.
        this.main = $('<div id="variationalEditorUI"></div>');
        this.sidePanel.append(this.main);

        // this.secondary holds the buttons.
        this.secondary = $(`<div id="variationalEditorUIButtons" class="veditor-secondary">
</div>`);
        this.sidePanel.append(this.secondary);

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

    createPanelMenu(name: string, color?: string) {
        const dimensionColor: string = color ? color : 'rgb(127, 71, 62)';
        if (!this.hasPanelMenu(name)) {
            this.panelMenus[name] = {
                name: name,
                color: dimensionColor,
                colorpicker: null,
                element: null
            };
            const panelMenu = this.panelMenus[name];
            const element = $(`<div class='form-group dimension-ui-div' id='${name}'>
  <input class='colorpicker' type='text' id="${name}-colorpicker">
  <h2>${name}</h2>
  <br>
  <div class="switch-toggle switch-3 switch-candy">
    <input id="${name}-view-both" name="state-${name}" type="radio" checked>
    <label for="${name}-view-both">BOTH</label>
    <br>
    <input id="${name}-view-thenbranch" name="state-${name}" type="radio" >
    <label for="${name}-view-thenbranch">DEF</label>
    <br>
    <input id="${name}-view-elsebranch" name="state-${name}" type="radio" >
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
                this.onColorChangeCb();
            });
            this.main.append(element);
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

    onColorChange(cb: () => any): void {
        this.onColorChangeCb = cb;
    }
}
