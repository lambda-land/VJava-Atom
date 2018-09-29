'use babel';

import * as path from 'path';

const variationalEditorPath = path.resolve(__dirname, '..'); // Project root directory.

export const sidePanelHTML = `<div><div id="variationalEditorUI"><div class="form-group dimension-ui-div" id="DEC">
  <input class="colorpicker" type="text" id="DEC-colorpicker">
  <h2>DEC</h2>
  <br>
  <div class="switch-toggle switch-3 switch-candy">
    <input id="DEC-view-both" name="state-DEC" type="radio" value="BOTH" checked="">
    <label for="DEC-view-both">BOTH</label>
    <br>
    <input id="DEC-view-defbranch" name="state-DEC" type="radio" value="DEF">
    <label for="DEC-view-defbranch">DEF</label>
    <br>
    <input id="DEC-view-ndefbranch" name="state-DEC" type="radio" value="NDEF">
    <label for="DEC-view-ndefbranch">NDEF</label>
  </div>
  <a href="" id="removeDimension-DEC" class="delete_icon"><img name="removeDimensionImg" border="0" src="${variationalEditorPath}/icons/delete-bin.png" width="16" height="18"></a>
  <br>
</div><div class="form-group dimension-ui-div" id="MULT">
  <input class="colorpicker" type="text" id="MULT-colorpicker">
  <h2>MULT</h2>
  <br>
  <div class="switch-toggle switch-3 switch-candy">
    <input id="MULT-view-both" name="state-MULT" type="radio" value="BOTH" checked="">
    <label for="MULT-view-both">BOTH</label>
    <br>
    <input id="MULT-view-defbranch" name="state-MULT" type="radio" value="DEF">
    <label for="MULT-view-defbranch">DEF</label>
    <br>
    <input id="MULT-view-ndefbranch" name="state-MULT" type="radio" value="NDEF">
    <label for="MULT-view-ndefbranch">NDEF</label>
  </div>
  <a href="" id="removeDimension-MULT" class="delete_icon"><img name="removeDimensionImg" border="0" src="${variationalEditorPath}/icons/delete-bin.png" width="16" height="18"></a>
  <br>
</div><div class="form-group dimension-ui-div" id="BIG">
  <input class="colorpicker" type="text" id="BIG-colorpicker">
  <h2>BIG</h2>
  <br>
  <div class="switch-toggle switch-3 switch-candy">
    <input id="BIG-view-both" name="state-BIG" type="radio" value="BOTH" checked="">
    <label for="BIG-view-both">BOTH</label>
    <br>
    <input id="BIG-view-defbranch" name="state-BIG" type="radio" value="DEF">
    <label for="BIG-view-defbranch">DEF</label>
    <br>
    <input id="BIG-view-ndefbranch" name="state-BIG" type="radio" value="NDEF">
    <label for="BIG-view-ndefbranch">NDEF</label>
  </div>
  <a href="" id="removeDimension-BIG" class="delete_icon"><img name="removeDimensionImg" border="0" src="${variationalEditorPath}/icons/delete-bin.png" width="16" height="18"></a>
  <br>
</div></div><div id="variationalEditorUIButtons" class="veditor-secondary">
</div></div>`
