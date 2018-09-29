'use babel';

import { Range } from 'atom';
import * as fs from 'fs';
import * as path from 'path';
import * as temp from 'temp';

import { variationalEditor } from '../lib/variational-editor';

import { exampleFile } from './example';
import { sidePanelHTML } from './sidePanelHTML';

temp.track();  // Allows temp package to clean up temp files/directories after exit.

// Use the command `window:run-package-specs` (cmd-alt-ctrl-p) to run specs.
//
// To run a specific `it` or `describe` block add an `f` to the front (e.g. `fit`
// or `fdescribe`). Remove the `f` to unfocus the block.

describe('end to end tests', () => {
  let activationPromise, filePath, workspaceElement;
  const fileName = 'example.c';

  // Set up editor with example file for tests.
  beforeEach(() => {
    const directory = temp.mkdirSync();  // Temp directory to work on example file.
    atom.project.setPaths([directory]);
    workspaceElement = atom.views.getView(atom.workspace);  // HTMLElement view.

    filePath = path.join(directory, fileName);  // Temp file to work on.
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
        const sidePanel = atom.workspace.getRightPanels()[0];

        // Ensure the side panel item is the variational editor side panel.
        expect(sidePanel.item.attr('id')).toBe('variationalEditorSidePanel');

        // The side panel should be visible.
        expect(sidePanel.isVisible()).toBe(true);

        // Untoggle the variational-editor command.
        atom.commands.dispatch(workspaceElement, 'variational-editor:toggle');
        waits(1000);

        // The side panel should be gone.
        expect(sidePanel.isVisible()).toBe(false);
      });
    });

    it('shows and hides the color markers in the file', () => {
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
        const expectedDecorations = {
          'dimension-marker-DEC-defbranch': {
            length: 2,
            ranges: [new Range([4, 0], [5, 0]),
                     new Range([24, 0], [25, 0])]
          },
          'dimension-marker-DEC-ndefbranch': {
            length: 1,
            ranges: [new Range([6, 0], [7, 0])]
          },
          'dimension-marker-MULT-defbranch': {
            length: 1,
            ranges: [new Range([10, 0], [16, 0])]
          },
          'dimension-marker-MULT-ndefbranch': {
            length: 1,
            ranges: [new Range([17, 0], [18, 0])]
          },
          'dimension-marker-BIG-defbranch': {
            length: 0,
            ranges: []
          },
          'dimension-marker-BIG-ndefbranch': {
            length: 1,
            ranges: [new Range([34, 0], [35, 0])]
          },
          'dimension-marker-MULT-defbranch-BIG-defbranch': {
            length: 1,
            ranges: [new Range([11, 0], [12, 0])]
          },
          'dimension-marker-MULT-defbranch-BIG-ndefbranch': {
            length: 1,
            ranges: [new Range([13, 0], [14, 0])]
          }
        }
        let editor = atom.workspace.getActiveTextEditor();

        for (let expectedDecorationName in expectedDecorations) {
          expectedDecoration = expectedDecorations[expectedDecorationName];
          decorations = editor.getDecorations({ class: expectedDecorationName });

          // The decoration retreived from the editor should have the same
          // length as the expected decoration.
          expect(decorations.length).toBe(expectedDecoration.length);

          for (let decoration of decorations) {
            const range = decoration.getMarker().getBufferRange();

            // The range of the decoration should exist in the expected
            // decoration ranges.
            expect(expectedDecoration.ranges.map((r) => { return r.isEqual(range); }))
              .toContain(true);
          }
        }

        // Untoggle the variational-editor command.
        atom.commands.dispatch(workspaceElement, 'variational-editor:toggle');
        waits(1000);

        for (let expectedDecoration in expectedDecorations) {
          expect(editor.getDecorations({ class: expectedDecorations }).length).toBe(0);
        }
      });
    });

    it('creates the stylesheet for the dimensions', () => {
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
        const expectedStyles = [
          'atom-text-editor div.dimension-marker-DEC-defbranch.line',
          'atom-text-editor div.dimension-marker-DEC-defbranch.line.cursor-line',
          'atom-text-editor div.dimension-marker-DEC-defbranch.line.hover-alt',
          'atom-text-editor div.dimension-marker-DEC-ndefbranch.line',
          'atom-text-editor div.dimension-marker-DEC-ndefbranch.line.cursor-line',
          'atom-text-editor div.dimension-marker-DEC-ndefbranch.line.hover-alt',
          'atom-text-editor div.dimension-marker-MULT-defbranch.line',
          'atom-text-editor div.dimension-marker-MULT-defbranch.line.cursor-line',
          'atom-text-editor div.dimension-marker-MULT-defbranch.line.hover-alt',
          'atom-text-editor div.dimension-marker-MULT-ndefbranch.line',
          'atom-text-editor div.dimension-marker-MULT-ndefbranch.line.cursor-line',
          'atom-text-editor div.dimension-marker-MULT-ndefbranch.line.hover-alt',
          'atom-text-editor div.dimension-marker-BIG-ndefbranch.line',
          'atom-text-editor div.dimension-marker-BIG-ndefbranch.line.cursor-line',
          'atom-text-editor div.dimension-marker-BIG-ndefbranch.line.hover-alt',
          'atom-text-editor div.dimension-marker-MULT-defbranch-BIG-defbranch.line',
          'atom-text-editor div.dimension-marker-MULT-defbranch-BIG-defbranch.line.cursor-line',
          'atom-text-editor div.dimension-marker-MULT-defbranch-BIG-defbranch.line.hover-alt',
          'atom-text-editor div.dimension-marker-MULT-defbranch-BIG-ndefbranch.line',
          'atom-text-editor div.dimension-marker-MULT-defbranch-BIG-ndefbranch.line.cursor-line',
          'atom-text-editor div.dimension-marker-MULT-defbranch-BIG-ndefbranch.line.hover-alt',
        ];
        const stylePath = path.resolve(
          atom.packages.resolvePackagePath('variational-editor-atom'),
          'styles',
          'projects',
          `${fileName}.css`);

        const styleSheets = atom.styles.getStyleElements().filter(element => {
          return element.sourcePath === stylePath;
        });

        expect(styleSheets.length).toBe(1);
        
        const styleSheet = styleSheets[0];

        const styles = styleSheet.textContent.trim().split('\n');
        expect(styles.length).toBe(expectedStyles.length);

        // Remove the rules, leaving just the classes.
        const styleClasses = styles.map((style) => {
          return style.split('{')[0].trim();
        });

        for (let expectedStyle of expectedStyles) {
          expect(styleClasses).toContain(expectedStyle);
        }

        // Ensure the list is sorted from least to most dimensions.
        // Remove the non-dimension classes and split the dimension class on
        // the hyphens.
        const dimensionClasses = styleClasses.map((style) => {
          const dimensionRegex = /.dimension-marker[^.]*/g;
          const dimensionClass = dimensionRegex.exec(style);
          return dimensionClass[0].split('-');
        });

        for (let i = 1; i < dimensionClasses.length; i++) {
          expect(dimensionClasses[i].length).not.toBeLessThan(dimensionClasses[i-1].length);
        }
        
        // Untoggle the variational-editor command.
        atom.commands.dispatch(workspaceElement, 'variational-editor:toggle');
        waits(1000);

        // The styleElement should not exist in atom.styles.
        expect(atom.styles.styleElements.indexOf(styleSheet)).toBe(-1);
      });
    });
  });
});
