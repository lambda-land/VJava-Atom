'use babel';

import * as fs from 'fs';
import * as path from 'path';
import * as temp from 'temp';

import { exampleFile, exampleTempFile } from './example';
import { sidePanelHTML } from './sidePanelHTML';

temp.track();  // Allows temp package to clean up temp files/directories after exit.

// Use the command `window:run-package-specs` (cmd-alt-ctrl-p) to run specs.
//
// To run a specific `it` or `describe` block add an `f` to the front (e.g. `fit`
// or `fdescribe`). Remove the `f` to unfocus the block.

// 

describe('end to end tests', () => {
  let activationPromise, filePath, filePathVEditor, workspaceElement;
  const fileName = 'example.c', fileNameVEditor = 'example-temp-veditor.c';

  // Set up editor with example file for tests.
  beforeEach(() => {
    const directory = temp.mkdirSync();  // Temp directory to work on example file.
    atom.project.setPaths([directory]);
    workspaceElement = atom.views.getView(atom.workspace);  // HTMLElement view.

    filePath = path.join(directory, fileName);  // Temp file to work on.
    filePathVEditor = path.join(directory, fileNameVEditor);
    fs.writeFileSync(filePath, exampleFile);

    waitsForPromise(() => {
      return atom.workspace.open(filePath);
    });

    // activationPromise will resolve after an activationCommand is run.
    activationPromise = atom.packages.activatePackage('variational-editor-atom');
  });

  afterEach(() => {
    temp.cleanupSync();  // Clean the temp directory.
  });

  // The tests in this block provide basic sanity checks.
  describe('sanity tests', () => {
    it ('ensures the active editor is the proper file', () => {
      const editor = atom.workspace.getActiveTextEditor();
      expect(editor.getTitle()).toBe(fileName);
      expect(editor.getText()).toBe(exampleFile);
    });

    it ('ensures the new file is created when variational-editor is toggled', () => {
      // This is an activation event, triggering it will cause the package to be
      // activated.
      atom.commands.dispatch(workspaceElement, 'variational-editor:toggle');

      waitsForPromise(() => {
        return activationPromise.then(() => {
          // The parseVariation method called when the package is toggled on spawns
          // a process and calls a callback. The method returns before the process
          // and callback finish executing causing the activationPromise to think
          // the package activation is finished when it really isn't. Set a timeout
          // for the time being to allow the package to finish its work before
          // testing expectations.
          waits(1000);
        });
      });

      runs(() => {
        const editor = atom.workspace.getActiveTextEditor();
        expect(fs.existsSync(filePathVEditor)).toBe(true);
        expect(editor.getTitle()).toBe(fileNameVEditor);
        expect(editor.getText()).toBe(exampleTempFile);

        // Untoggle the variational-editor command.
        atom.commands.dispatch(workspaceElement, 'variational-editor:toggle');
        waits(1000);

        expect(fs.existsSync(filePathVEditor)).toBe(false);
      });
    });
  });

  describe('when the variational-editor:toggle event is triggered', () => {
    it('shows and hides the side panel', () => {
      // Before the activation event the view is not on the DOM, and no panel
      // has been created
      expect(atom.workspace.getRightPanels().length).toBe(0);

      // This is an activation event, triggering it will cause the package to be
      // activated.
      atom.commands.dispatch(workspaceElement, 'variational-editor:toggle');

      waitsForPromise(() => {
        return activationPromise.then(() => {
          // The parseVariation method called when the package is toggled on spawns
          // a process and calls a callback. The method returns before the process
          // and callback finish executing causing the activationPromise to think
          // the package activation is finished when it really isn't. Set a timeout
          // for the time being to allow the package to finish its work before
          // testing expectations.
          waits(1000);
        });
      });

      runs(() => {
        // A side bar should be created with the color picker(s).
        const sidePanels = atom.workspace.getRightPanels();
        expect(sidePanels.length).toBe(1);

        // Compare the HTML. For the time being this is a "catch-all" test, but
        // as the package is refactored, this test should be split into more
        // granular tests of the html.
        const sidePanel = sidePanels[0].item[0];
        expect(sidePanel.outerHTML).toBe(sidePanelHTML);

        // Untoggle the variational-editor command.
        atom.commands.dispatch(workspaceElement, 'variational-editor:toggle');
        waits(1000);

        // The side panel should be gone.
        expect(atom.workspace.getRightPanels().length).toBe(0);
      });
    });

    it('shows and hides the temporary file', () => {
      // This is an activation event, triggering it will cause the package to be
      // activated.
      atom.commands.dispatch(workspaceElement, 'variational-editor:toggle');

      waitsForPromise(() => {
        return activationPromise.then(() => {
          // The parseVariation method called when the package is toggled on spawns
          // a process and calls a callback. The method returns before the process
          // and callback finish executing causing the activationPromise to think
          // the package activation is finished when it really isn't. Set a timeout
          // for the time being to allow the package to finish its work before
          // testing expectations.
          waits(1000);
        });
      });

      runs(() => {
        // Check the decoration markers are present on the editor.
        let editor = atom.workspace.getActiveTextEditor();
        expect(editor.getDecorations({class: 'dimension-marker-DEC-defbranch'}).length).toBe(2);
        expect(editor.getDecorations({class: 'dimension-marker-DEC-ndefbranch'}).length).toBe(1);
        expect(editor.getDecorations({class: 'dimension-marker-MULT-defbranch'}).length).toBe(1);
        expect(editor.getDecorations({class: 'dimension-marker-MULT-ndefbranch'}).length).toBe(1);
        expect(editor.getDecorations({class: 'dimension-marker-BIG-defbranch'}).length).toBe(1);
        expect(editor.getDecorations({class: 'dimension-marker-BIG-ndefbranch'}).length).toBe(2);

        // Untoggle the variational-editor command.
        atom.commands.dispatch(workspaceElement, 'variational-editor:toggle');
        waits(1000);

        // Check the decoration markers are no longer present on the editor.
        // Unlock these tests while refactoring the teardown process.
        /* editor = atom.workspace.getActiveTextEditor();
         * expect(editor.getDecorations({class: 'dimension-marker-DEC-defbranch'}).length).toBe(0);
         * expect(editor.getDecorations({class: 'dimension-marker-DEC-ndefbranch'}).length).toBe(0);
         * expect(editor.getDecorations({class: 'dimension-marker-MULT-defbranch'}).length).toBe(0);
         * expect(editor.getDecorations({class: 'dimension-marker-MULT-ndefbranch'}).length).toBe(0);
         * expect(editor.getDecorations({class: 'dimension-marker-BIG-defbranch'}).length).toBe(0);
         * expect(editor.getDecorations({class: 'dimension-marker-BIG-ndefbranch'}).length).toBe(0);*/
      });
    });
  });
});
