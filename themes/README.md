# Ambergris application themes

Editor, notebook and terminal themes generated from [`../tokens.json`](../tokens.json) by `node build.mjs`.

Everything under `zed/`, `vscode/`, `obsidian/`, `logseq/`, `ghostty/`, `firefox/` and `thunderbird/`, plus `specimen.html`, is **generated output**. Edit the tokens, not these files. This README is the only hand-written file in the directory.

**Open [`specimen.html`](specimen.html) first.** A syntax theme cannot be judged from a table of hexes, so the build renders one: the same code sample on both canvases, the syntax ladder sorted by contrast, the ANSI grid with its collisions marked, and the severity and bracket-depth strips.

## The rule that shapes all five

Ambergris has no categorical palette. The grey ramp is ordinal, the accent is reserved for interaction, and the five-stop data sweep is sequential and barred from interface chrome. Syntax highlighting is categorical, so something had to give.

**Syntax here is achromatic.** Token category is carried by luminance step plus slope and weight:

| | dark | light |
|---|---|---|
| keyword, function, tag | grey-000, bold | grey-1000, bold |
| type, variable | grey-100, type italic | grey-950, type italic |
| property, parameter | grey-200 | grey-900 |
| constant, number, namespace | grey-300 | grey-800 |
| string, operator | grey-400 | grey-700 |
| punctuation | grey-500 | grey-600 |
| comment | grey-600, italic | grey-500, italic |

The teal accent appears in an editor only where rule 1 already allows it: the caret, the selection, the active tab and item, focus rings, and link text in Markdown. It never marks a syntax category and never marks severity.

Diagnostics and diffs stay achromatic too. Severity is fill density plus the host's own icon and gutter glyph, per rule 2. Keep gutter icons and `git diff` prefixes visible; they are carrying the signal that hue normally would.

## Six slots that are really a depth

`depth-1` … `depth-6` is one ordinal ladder, reused wherever a host asks for six distinguishable things that are actually ranked: bracket nesting, heading level, chart series. Renderers read it two ways. Headings and charts read it monotonically, so level 1 is the loudest. Brackets read it `1,4,2,5,3,6`, because there adjacent levels are what must separate, and a monotone ramp puts the two closest greys side by side.

This is why VS Code's rainbow bracket colorization is overridden rather than left alone: nesting depth is ordinal, and six hues encode it worse than six luminance steps do.

## Where the data sweep went

Nowhere, and that is the finding rather than an oversight.

The sweep is **sequential only** — its hues are analogous and cannot be told apart reliably enough for unordered groups. Every six-slot opening these five hosts expose is categorical: ANSI hue names, `charts.red`/`charts.blue`, Obsidian's resolved/unresolved/tag/attachment graph nodes. None of them is a sequence, so none of them gets the sweep. They all get the achromatic ordinal ladder instead.

The build enforces this rather than trusting the prose: if any editor or terminal role ever resolves to a sweep colour, it exits 1 before writing a file.

## Sealing the chromatic defaults

An editor theme is not just the keys you set; it is also the ones you leave at the host's default. VS Code alone ships chromatic defaults for bracket pair colorization, the 33 outline and suggest `symbolIcon` colours, merge conflict blocks, `charts.*`, debug value inspection, test result icons, notebook status icons, problem icons and the overview ruler. All are overridden here. Symbol icons echo the syntax ladder, so a class in the outline is the same grey as a class in the code.

## ANSI is the lossy part

Six ANSI hue slots map onto six luminance steps, ordered by how loudly each conventionally speaks: red, green, yellow, blue, magenta, cyan. Only about eight ramp steps clear 3:1 on a given canvas, so twelve chromatic slots cannot all be distinct.

The bright hues therefore **repeat** their normal counterparts rather than shifting a step. Offsetting them would land `bright-green` exactly on `red`, making success read as failure. Brightness is left to the terminal's own bold rendering. That yields 10 distinct values out of 16, with no cross-hue collisions.

Programs that encode meaning in hue alone lose information. Keep `git`'s `+`/`-` prefixes and `ls -F` classifiers on.

## Install

### Zed

```sh
cp zed/ambergris.json ~/.config/zed/themes/
```

Then `cmd-k cmd-t`, or pin both variants in `settings.json`:

```json
"theme": { "mode": "system", "light": "Ambergris Light", "dark": "Ambergris Dark" }
```

### VS Code

```sh
cp -R vscode ~/.vscode/extensions/ambergris-0.2.0
```

Restart, then `cmd-k cmd-t` and pick **Ambergris Light** or **Ambergris Dark**. To build a `.vsix` instead, run `npx @vscode/vsce package` inside `vscode/`.

Semantic highlighting is on. If your language server's semantic tokens look flatter than the TextMate fallback, that is expected: the semantic map is deliberately coarser.

### Obsidian

```sh
cp -R obsidian "<vault>/.obsidian/themes/Ambergris"
```

The folder must contain both `manifest.json` and `theme.css`. Then **Settings → Appearance → Themes → Ambergris**. Obsidian derives most of its surface colours from `--color-base-00`…`--color-base-100`, so the ramp runs background-end to text-end and flips direction per mode.

Headings read the depth ladder. Obsidian's fourteen callout types collapse onto four severities, since `note`, `tip`, `success` and `done` are the same claim wearing different hats; the type-specific variables want a bare RGB triplet, not a colour function. Graph nodes stay on the ramp, with only the focused node taking the accent.

### Logseq

For classic, file-based Logseq. Either copy the file into place:

```sh
cp logseq/custom.css "<graph>/logseq/custom.css"
```

or, if you already have a `custom.css`, drop it alongside under another name and import it:

```sh
cp logseq/custom.css "<graph>/logseq/ambergris.css"
```

```css
/* first line of <graph>/logseq/custom.css */
@import url("./ambergris.css");
```

Toggle light and dark with `t t`. Code blocks are themed through CodeMirror 5 token classes.

### Ghostty

```sh
cp ghostty/ambergris-* ~/.config/ghostty/themes/
```

Then in `~/.config/ghostty/config`:

```
theme = light:ambergris-light,dark:ambergris-dark
```

Leave `bold-is-bright` at its default of `false`. Turning it on collapses the normal and bright rows onto each other, which in an achromatic palette costs more than it does in a chromatic one.

### Firefox

One package covering both modes, built for you at [`firefox/ambergris.xpi`](firefox/ambergris.xpi). Firefox switches between the manifest's `theme` and `dark_theme` blocks with the system colour scheme.

Load it at `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick the `.xpi`. Temporary add-ons are dropped at restart. Firefox requires signed add-ons for a permanent install, so for that, submit the same `.xpi` to addons.mozilla.org; a self-distribution signature works and does not require a public listing.

The selected tab shares its colour with the toolbar so the two read as one plane, with the frame a step behind. The focus ring on the address bar is deliberately achromatic: in Ambergris the accent says which item is current, and focus says where the keyboard is. Those are different questions, and focus has to survive on every surface.

### Thunderbird

Two packages, one per mode: [`thunderbird/ambergris-light.xpi`](thunderbird/ambergris-light.xpi) and [`thunderbird/ambergris-dark.xpi`](thunderbird/ambergris-dark.xpi). Thunderbird requires an explicit add-on id and does not document the `dark_theme` key, so each mode ships complete rather than relying on behaviour that is not specified.

**Tools → Add-ons and Themes → gear icon → Install Add-on From File**. Install both if you want to switch by hand; Thunderbird lists them as separate themes.

### About the .xpi files

An `.xpi` is a ZIP with `manifest.json` at the root. `zip(1)` stamps each entry with the file's mtime, which would leave the tree dirty after every rebuild, so [`../zip.mjs`](../zip.mjs) writes them with entries fixed at the ZIP epoch and stored rather than deflated. Deflate output is only stable for a given zlib build, which would make the byte output depend on the Node version in use.

The result is reproducible: rebuilding produces byte-identical archives. The unpacked `manifest.json` next to each one is the same file, kept for reading and diffing.

## Changing the author name

Both the Zed theme family and the Obsidian manifest carry an `author` field, taken from `meta.author` in `tokens.json`. It ships as `"Ambergris"`. Change it there and rebuild.
