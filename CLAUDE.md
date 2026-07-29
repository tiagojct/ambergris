# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Ambergris is a design token system: a near-monochrome cool grey ramp, one teal accent restricted to interactive state, and a five-stop hue sweep reserved for data visualisation. It ships as a single generated CSS file, a self-contained HTML specimen, and themes for five applications.

## Commands

```bash
node build.mjs      # the only command: validates, emits ambergris.css, specimen.html and themes/
```

No package.json, no dependencies, no test runner, no linter. Requires Node with ESM and `import.meta.url` support (developed on v22).

The build is deterministic. Running it on a clean tree must leave the tree clean; if `git status` is dirty after a build with no source edit, something is wrong.

## Generated vs. source

| File | Role |
|---|---|
| [tokens.json](tokens.json) | Single source of truth. Every value originates here. |
| [build.mjs](build.mjs) | Validator plus CSS/specimen emitter. Hand-written. |
| [themes.mjs](themes.mjs) | Application theme renderers, called from build.mjs. Hand-written. |
| [zip.mjs](zip.mjs) | Deterministic ZIP writer, used to package `.xpi`. Hand-written. |
| [specimen.src.html](specimen.src.html) | Specimen template. Hand-written. |
| [themes/README.md](themes/README.md) | Install instructions. Hand-written, and the only such file under `themes/`. |
| [ambergris.css](ambergris.css) | **Generated.** Do not hand-edit. |
| [specimen.html](specimen.html) | **Generated.** Do not hand-edit. |
| [themes/](themes/)`<host>/` | **Generated.** Do not hand-edit. |

`specimen.src.html` carries two placeholders that the build substitutes: `/* @TOKENS@ */` inside the first `<style>` (receives the whole emitted CSS) and `/* @DATA@ */` inside `<script id="ramp-data" type="application/json">` (receives a JSON blob of ramps, the 13x13 contrast matrix, and the data sweeps). Everything visible in the specimen is drawn client-side from that blob, so specimen sections stay in sync with the ramp automatically.

## The three design rules

Encoded in `meta.rules` and printed into the CSS header. Changes that violate them are the kind of change to raise before making:

1. Accent marks interaction only: links, current item, selection, accent rules. Never severity, never decoration.
2. Status is achromatic. Severity is carried by border weight, edge style and fill density, plus an icon and explicit copy.
3. The data sweep never appears in interface chrome, and the interface accent never appears in a chart.

## Build pipeline

1. **Alias resolution.** Any string value may contain `{dot.path.to.token}` references, resolved recursively against the parsed `tokens.json` (cycle guard at depth 12). If the target is an object with a `hex` field, the hex is substituted. Unknown paths and non-scalar targets throw.
2. **Contrast gate.** Every entry in `contrast.assert` is checked with WCAG relative luminance against its `min`. Results print one line each. **Any failure exits 1 before a single file is written**, so a ramp edit that breaks a legibility floor cannot silently ship.
3. **CSS emission.** Groups are emitted by explicit hand-written loops, not by a generic tree walk (see gotchas).
4. **Specimen emission.** Reads the CSS it just wrote, inlines it plus the data blob into the template.
5. **Theme emission.** [themes.mjs](themes.mjs) runs two gates before rendering, each exiting 1 on failure: `editor.light`/`editor.dark` must define identical role sets and both `terminal` maps must cover all sixteen ANSI slots; and no editor or terminal role may resolve to a data sweep colour. It then renders each host format plus `themes/specimen.html`.

## Application themes

One role vocabulary, `editor` in [tokens.json](tokens.json), is rendered into seven hosts by [themes.mjs](themes.mjs): Zed, VS Code, Obsidian, Logseq, Ghostty, Firefox and Thunderbird. Each host's key names were taken from its published schema rather than from memory; the mapping tables (`ZED_SYNTAX`, `TM_SCOPES`, `SEMANTIC`, `SYMBOL_ICONS`, `OB_BASE`, `OB_CALLOUTS`, `CM_TOKENS`, `ANSI_ORDER`, `geckoColors`) are where a host's vocabulary meets ours.

Firefox and Thunderbird share the WebExtension theme manifest key, so `geckoColors` is built once and trimmed per host: `ntp_*` is Firefox-only, `sidebar_highlight_border` is Thunderbird-only, and `tab_loading` is dropped for a mail client. Firefox ships one package using `theme` plus `dark_theme`; Thunderbird ships one package per mode, because it requires an explicit add-on id and does not document `dark_theme`.

Both are packaged to `.xpi` by [zip.mjs](zip.mjs), a ~90 line deterministic ZIP writer. Two decisions there exist purely to protect the clean-tree contract: entries are stamped at the ZIP epoch (1980-01-01) rather than mtime, and stored rather than deflated, since deflate output is only stable for a given zlib build and would tie the bytes to the Node version. Both the `.xpi` and the loose `manifest.json` are emitted; the loose copy is for reading and diffing.

Three constraints shape that layer, and all three follow from the system having no categorical palette:

- **Syntax is achromatic.** Category is carried by luminance step plus slope and weight, never by hue. The accent enters an editor only where rule 1 already allows it: caret, selection, active item, focus, Markdown links.
- **Diagnostics and diffs are achromatic.** Severity is fill density, per rule 2, leaning on the host's own icons and gutter glyphs.
- **ANSI loses information, deliberately.** Six hue slots map onto six luminance steps. The bright hues repeat their normal counterparts instead of shifting a step, because a one-step offset lands `bright-green` exactly on `red`. That gives 10 distinct values out of 16 with no cross-hue collisions. If you re-tune the terminal ramp, re-check for cross-hue collisions; the build does not.

`depth-1` … `depth-6` is one ordinal ladder serving every six-slot opening that is really a rank: bracket nesting, heading level, chart series. `DEPTH` reads it monotonically; `BRACKET` reads it `1,4,2,5,3,6`, because bracket levels need adjacent separation and a monotone ramp puts the two closest greys next to each other.

**The data sweep reaches none of the five themes, and the guard in `emitThemes` keeps it that way.** Every six-slot opening these hosts expose is categorical (ANSI hue names, `charts.red`/`charts.blue`, Obsidian graph node types) and the sweep is sequential-only, so they all take the ordinal ladder instead. If a future host exposes a genuinely sequential scale, that is the one place the sweep belongs, and the guard will need a documented exception rather than a quiet edit.

**Sealing chromatic defaults is half the work.** A key left unset inherits the host's colourful default. VS Code alone needed overrides for bracket pair colorization, 33 `symbolIcon.*` entries, merge blocks, `charts.*`, `debugTokenExpression.*`, `testing.icon*`, notebook status icons, problem icons, minimap and the overview ruler. When adding a host or upgrading one, sweep its reference for chromatic defaults rather than only mapping the obvious keys.

[themes/specimen.html](themes/specimen.html) is generated and renders the sample code, the syntax ladder with contrast figures, the ANSI grid with collisions marked, and the severity and bracket strips. `SAMPLE` in themes.mjs is a hand-tokenised `[role, text]` stream, so it stays accurate without a parser.

Colour plumbing lives in `parseColor`/`hex6`/`hex8`/`over`. Hosts that understand alpha get the `rgb(… / a)` string or `#rrggbbaa`; Ghostty has no alpha channel, so `p.flat()` composites the overlay onto the canvas first.

## Emitted CSS layering

Order matters and is fixed:

1. `:root` primitives: grey ramp, accent ramp, alpha overlays, both data sweeps, border widths/radii, focus metrics, shadows, status weight/edge/fill/accent.
2. Semantic layer, emitted three times from the same `theme.light` / `theme.dark` maps: `:root, [data-theme="light"]`, then `[data-theme="dark"]`, then `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`. The explicit attribute always wins over the media query.
3. `@supports (color: oklch(0 0 0))` re-declares the grey, accent and data ramps in OKLCH. Hex is the sRGB fallback; OKLCH is the wide-gamut truth.
4. Unscoped primitives: `*:focus-visible` (two-layer halo plus ring box-shadow, deliberately achromatic), `a`, `hr`/`.am-rule`, `::selection`, and a `prefers-reduced-motion` clamp.

Variable prefix (`am`) comes from `meta.prefix`; the output filename comes from `meta.name.toLowerCase()`.

## Gotchas when editing tokens.json

- **Every colour needs both `hex` and `oklch`, kept in sync by hand.** Contrast assertions only ever read the hex. An OKLCH value that drifts from its hex will pass the gate and still ship wrong on wide-gamut displays.
- **Add a semantic token to both `theme.light` and `theme.dark`.** The emitter maps over each mode independently. A key present only in light is emitted in the light block, never overridden in dark, and silently leaks the light value into dark mode. `editor.light`/`editor.dark` have the same hazard but it *is* caught: themes.mjs rejects a role defined in only one mode. `theme.*` is still unchecked.
- **`editor.style` is mode-independent** and keyed by role name, so slope and weight are identical in light and dark by construction. Only the colour flips.
- **`alpha.*` values are hardcoded `rgb(r g b / a)` strings** that duplicate three ramp anchors: `ink` is grey-1000 (`#0C1117`), `paper` is grey-000 (`#FAFBFD`), `accent` is accent-500 (`#2F9F99`). Changing any of those three hexes requires updating the corresponding alpha group by hand; nothing checks this.
- **`comment` keys are prose, not tokens.** They are stripped by the `ordered()` helper and skipped explicitly in the `shadow` and `status` loops. A `comment` added to a group iterated with plain `Object.entries` (currently `border.width`, `border.radius`, `theme.*`) would be emitted as a CSS variable.
- **Key ordering is forced numerically** via `parseInt`, because JS object iteration puts integer-like keys first and the grey ramp runs `"000"` to `"1000"`. The same trap bites any map keyed by zero-padded numbers: `OB_BASE` in themes.mjs is an array of pairs precisely because `"10"` is an integer-like key and would hoist above `"00"`.
- **A new token group needs a new emit loop in `build.mjs`.** The alpha groups (`ink`, `paper`, `accent`) and data sets (`sequence-on-light`, `sequence-on-dark`) are hardcoded lists in the emitter.
- **Not everything in `tokens.json` reaches the CSS.** `status.*.icon`, `data.supplied` and `data.hue-path` are metadata: the icon names are guidance for implementers, the other two feed only the specimen.
- **Adding a colour usually means adding a `contrast.assert` entry** for the role it is meant to play. The assertion list is the system's regression suite.

## Data sweep semantics

`sequence-on-light` and `sequence-on-dark` are **sequential only**. The hues are analogous and cannot be distinguished reliably enough for categorical encoding. Pick the variant matching the chart background, not the page theme. Adjacent steps clear 1.2:1 in both variants, the practical floor for touching areas.
