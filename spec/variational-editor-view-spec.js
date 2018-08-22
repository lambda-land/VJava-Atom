'use babel';

import * as path from 'path';

import { VariationalEditorView } from '../lib/variational-editor-view';

const variationalEditorPath = path.resolve(__dirname, '..');

const colorPickerHTML = `<div class="form-group dimension-ui-div" id="DIM">
  <input class="colorpicker" type="text" id="DIM-colorpicker" style="display: none;"><div class="sp-replacer sp-light"><div class="sp-preview"><div class="sp-preview-inner" style="background-color: rgb(127, 71, 62);"></div></div><div class="sp-dd">▼</div></div>
  <h2>DIM</h2>
  <br>
  <div class="switch-toggle switch-3 switch-candy">
    <input id="DIM-view-both" name="state-DIM" type="radio" checked="">
    <label for="DIM-view-both">BOTH</label>
    <br>
    <input id="DIM-view-thenbranch" name="state-DIM" type="radio">
    <label for="DIM-view-thenbranch">DEF</label>
    <br>
    <input id="DIM-view-elsebranch" name="state-DIM" type="radio">
    <label for="DIM-view-elsebranch">NDEF</label>
  </div>
  <a href="" id="removeDimension-DIM" class="delete_icon"><img name="removeDimensionImg" border="0" src="${variationalEditorPath}/icons/delete-bin.png" width="16" height="18"></a>
  <br>
</div>`;

const name1 = 'DIM1', name2 = 'DIM2', name3 = 'DIM3';

/* Create data in expected format from backend. */
const dimensions = {
  type: 'choice',
  name: name1,
  thenbranch: {
    type: 'region',
    segments: [
      {
        type: 'choice',
        name: name2,
        thenbranch: { type: 'region', segments: [] },
        elsebranch: {
          type: 'region',
          segments: [
            {
              type: 'choice',
              name: name1,
              thenbranch: { type: 'region', segments: [] },
              elsebranch: { type: 'region', segments: [] },
              kind: 'positive'
            }
          ]
        },
        kind: 'positive'
      },
      {
        type: 'text',
        content: 'some text'
      }
    ]
  },
  elsebranch: { type: 'region', segments: [] },
  kind: 'contrapositive'
}

describe('VariationalEditorView', () =>{
  describe('when the VariationalEditorView is constructed', () => {
    it('creates the side panel element', () => {
      view = new VariationalEditorView({});
      expect(view.main.attr('id')).toBe('variationalEditorUI');
      expect(view.secondary.attr('id')).toBe('variationalEditorUIButtons');
      expect(view.secondary.attr('class')).toBe('veditor-secondary');
    });
  });

  let variationalEditorView, dimensionName = 'DIM';
  beforeEach(() => {
    variationalEditorView = new VariationalEditorView({});
  });

  describe('when a dimension is added', () => {
    it('sets the initial color', () => {
      variationalEditorView.createPanelMenu(dimensionName);
      const panelMenu = variationalEditorView.getPanelMenu(dimensionName);
      expect(panelMenu.color).toBe('rgb(127, 71, 62)');
    });

    it('generates a menu for the dimension', () => {
      variationalEditorView.createPanelMenu(dimensionName);
      const panelMenu = variationalEditorView.getPanelMenu(dimensionName);
      expect(panelMenu.element[0].outerHTML).toBe(colorPickerHTML);
    });
  });

  describe('when dimensions are added', () => {
    it('creates side panels for each dimension', () => {
      variationalEditorView.createPanelMenuItems(dimensions);
      expect(variationalEditorView.hasPanelMenu(name1)).toBe(true);
      expect(variationalEditorView.hasPanelMenu(name2)).toBe(true);
      expect(variationalEditorView.hasPanelMenu(name3)).toBe(false);
    });
  });
});
