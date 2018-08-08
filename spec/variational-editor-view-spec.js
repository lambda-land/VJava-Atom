'use babel';

import * as path from 'path';

import { VariationalEditorView } from '../lib/variational-editor-view';

const variationalEditorPath = path.resolve(__dirname, '..');

const colorPickerHTML = `<div class="form-group dimension-ui-div" id="DIM">
  <input class="colorpicker" type="text" id="DIM-colorpicker">
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

describe('VariationalEditorView', () =>{
  describe('when the VariationalEditorView is constructed', () => {
    it('creates the side panel element', () => {
      view = new VariationalEditorView({});
      expect(view.main.attr('id')).toBe('variationalEditorUI');
      expect(view.secondary.attr('id')).toBe('variationalEditorUIButtons');
      expect(view.secondary.attr('class')).toBe('veditor-secondary');
    });
  });

  describe('when a dimension is added', () => {
    let variationalEditorView;
    beforeEach(() => {
      variationalEditorView = new VariationalEditorView({});
    });

    it('creates a color picker', () => {
      variationalEditorView.createColorPicker('DIM');
      const colorPicker = variationalEditorView.main.children()[0];
      expect(colorPicker.outerHTML).toBe(colorPickerHTML);
    });
  });
});
