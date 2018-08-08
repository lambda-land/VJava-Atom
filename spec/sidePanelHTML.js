'use babel';

import * as path from 'path';

const variationalEditorPath = path.resolve(__dirname, '..'); // Project root directory.

export const sidePanelHTML = `<div><div id="variationalEditorUI"><div class="form-group dimension-ui-div" id="DEC">
  <input class="colorpicker" type="text" id="DEC-colorpicker">
  <h2>DEC</h2>
  <br>
  <div class="switch-toggle switch-3 switch-candy">
    <input id="DEC-view-both" name="state-DEC" type="radio" checked="">
    <label for="DEC-view-both">BOTH</label>
    <br>
    <input id="DEC-view-thenbranch" name="state-DEC" type="radio">
    <label for="DEC-view-thenbranch">DEF</label>
    <br>
    <input id="DEC-view-elsebranch" name="state-DEC" type="radio">
    <label for="DEC-view-elsebranch">NDEF</label>
  </div>
  <a href="" id="removeDimension-DEC" class="delete_icon"><img name="removeDimensionImg" border="0" src="${variationalEditorPath}/icons/delete-bin.png" width="16" height="18"></a>
  <br>
</div><div class="form-group dimension-ui-div" id="MULT">
  <input class="colorpicker" type="text" id="MULT-colorpicker">
  <h2>MULT</h2>
  <br>
  <div class="switch-toggle switch-3 switch-candy">
    <input id="MULT-view-both" name="state-MULT" type="radio" checked="">
    <label for="MULT-view-both">BOTH</label>
    <br>
    <input id="MULT-view-thenbranch" name="state-MULT" type="radio">
    <label for="MULT-view-thenbranch">DEF</label>
    <br>
    <input id="MULT-view-elsebranch" name="state-MULT" type="radio">
    <label for="MULT-view-elsebranch">NDEF</label>
  </div>
  <a href="" id="removeDimension-MULT" class="delete_icon"><img name="removeDimensionImg" border="0" src="${variationalEditorPath}/icons/delete-bin.png" width="16" height="18"></a>
  <br>
</div><div class="form-group dimension-ui-div" id="BIG">
  <input class="colorpicker" type="text" id="BIG-colorpicker">
  <h2>BIG</h2>
  <br>
  <div class="switch-toggle switch-3 switch-candy">
    <input id="BIG-view-both" name="state-BIG" type="radio" checked="">
    <label for="BIG-view-both">BOTH</label>
    <br>
    <input id="BIG-view-thenbranch" name="state-BIG" type="radio">
    <label for="BIG-view-thenbranch">DEF</label>
    <br>
    <input id="BIG-view-elsebranch" name="state-BIG" type="radio">
    <label for="BIG-view-elsebranch">NDEF</label>
  </div>
  <a href="" id="removeDimension-BIG" class="delete_icon"><img name="removeDimensionImg" border="0" src="${variationalEditorPath}/icons/delete-bin.png" width="16" height="18"></a>
  <br>
</div></div><div id="variationalEditorUIButtons" class="veditor-secondary">
  <a href="" id="addNewDimension">
    <img id="addNewDimensionImg" border="0" src="${variationalEditorPath}/icons/add_square_button.png" width="30" height="30">
  </a>
</div></div>`
