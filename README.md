# Variational Editor Atom

![A screenshot of your package](https://f.cloud.github.com/assets/69169/2290250/c35d867a-a017-11e3-86be-cd7c5bf3ff9b.gif)

## Install

### Requirements

The following are required to install the editor plugin.

* [npm](https://www.npmjs.com/get-npm)
* [Atom](https://flight-manual.atom.io/getting-started/sections/installing-atom/)
* variational-editor-backend (see https://github.com/lambda-land/variational-editor-backend)

Follow the instructions in the variational-editor-backend repository to build
the variational-parser, then install the parser under the `lib/` directory in
this package.

---
**Note**

To find the variational-parser executable location, run the following command
from the root of the *variational-editor-backend* project (assuming you built the
executable using Stack).

```bash
# To find the location of the variational-parser.
stack exec which variational-parser
# One-liner to copy it to the variational-editor-atom lib.
cp -v `stack exec which variational-parser` /path/to/variational-editor-atom/lib/
```

---

### Linking to Atom

Clone the repository, copy the variational-parser executable to the lib/
directory, install npm packages, then run the `atominstall` command
from the project root.

```bash
cd variational-editor-atom
npm install
npm run atominstall
```

The `atominstall` command creates a link to Atoms package directory (typically
under ~/.atom/packages) using Atoms built in command line utility. Any changes
made to this package will propogate to Atom (after Atom is restarted).

## Developing

Run the command:

```bash
npm run develop
```

to watch the TypeScript files for changes and open the editor in development
mode. To reload Atom in development mode, use the key binding `ALT+CTRL+R`.
Since Atom is built on the Chrome browser, the developer console can be
accessed with the key binding `CTRL+SHIFT+I`.

### Session State

When developing, there may be instances where the state of the plugin is saved
across Atom sessions. To delete this state run the command:

```bash
atom --clear-window-state
```

---
**WARNING**

This will delete all saved state for Atom, including unsaved files and other
package state.

---

## Testing

Tests can be run on the command line with `npm run test` or when this project
is open in Atom with the key binding `CTRL+SHIFT+Y`.

## Contributing

### Adding dependencies from DefinitelyTyped

DefinitelyTyped publishes type definition files for thousands of existing JS
packages to allow compatibility with TypeScript. Most of these packages have a
procedurally generated package.json file that does not specify versions for
their dependencies. This results in inconsistent builds and can break the
dependencies this package relies on.

In order to avoid this issue, *all* `@types` packages, including dependencies
of dependencies and so on, should be specified in the package.json file for
the Variational Editor Atom plugin. To find all `@types` packages installed by
npm run `npm list`.

## Resources

The following resources are a good place to start for getting up and running
with TypeScript and Atom.

* [TypeScript Deep Dive](https://basarat.gitbooks.io/typescript/)
* [Atom Flight Manual](https://flight-manual.atom.io/) (Especially chapter 3)
