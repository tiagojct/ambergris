# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Ambergris is a design token system: a near-monochrome cool grey ramp, one teal accent restricted to interactive state, and a five-stop hue sweep reserved for data visualisation. It ships as a single generated CSS file plus a self-contained HTML specimen.

## Commands

```bash
node build.mjs      # the only command: validates contrast, emits ambergris.css and specimen.html
```

No package.json, no dependencies, no test runner, no linter. Requires Node with ESM and `import.meta.url` support (developed on v22).

The build is deterministic. Running it on a clean tree must leave the tree clean; if `git status` is dirty after a build with no source edit, something is wrong.

## Generated vs. source

| File | Role |
|---|---|
| [tokens.json](tokens.json) | Single source of truth. Every value originates here. |
| [build.mjs](build.mjs) | Validator plus emitter. Hand-written. |
| [specimen.src.html](specimen.src.html) | Specimen template. Hand-written. |
| [ambergris.css](ambergris.css) | **Generated.** Do not hand-edit. |
| [specimen.html](specimen.html) | **Generated.** Do not hand-edit. |

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

## Emitted CSS layering

Order matters and is fixed:

1. `:root` primitives: grey ramp, accent ramp, alpha overlays, both data sweeps, border widths/radii, focus metrics, shadows, status weight/edge/fill/accent.
2. Semantic layer, emitted three times from the same `theme.light` / `theme.dark` maps: `:root, [data-theme="light"]`, then `[data-theme="dark"]`, then `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`. The explicit attribute always wins over the media query.
3. `@supports (color: oklch(0 0 0))` re-declares the grey, accent and data ramps in OKLCH. Hex is the sRGB fallback; OKLCH is the wide-gamut truth.
4. Unscoped primitives: `*:focus-visible` (two-layer halo plus ring box-shadow, deliberately achromatic), `a`, `hr`/`.am-rule`, `::selection`, and a `prefers-reduced-motion` clamp.

Variable prefix (`am`) comes from `meta.prefix`; the output filename comes from `meta.name.toLowerCase()`.

## Gotchas when editing tokens.json

- **Every colour needs both `hex` and `oklch`, kept in sync by hand.** Contrast assertions only ever read the hex. An OKLCH value that drifts from its hex will pass the gate and still ship wrong on wide-gamut displays.
- **Add a semantic token to both `theme.light` and `theme.dark`.** The emitter maps over each mode independently. A key present only in light is emitted in the light block, never overridden in dark, and silently leaks the light value into dark mode.
- **`alpha.*` values are hardcoded `rgb(r g b / a)` strings** that duplicate three ramp anchors: `ink` is grey-1000 (`#0C1117`), `paper` is grey-000 (`#FAFBFD`), `accent` is accent-500 (`#2F9F99`). Changing any of those three hexes requires updating the corresponding alpha group by hand; nothing checks this.
- **`comment` keys are prose, not tokens.** They are stripped by the `ordered()` helper and skipped explicitly in the `shadow` and `status` loops. A `comment` added to a group iterated with plain `Object.entries` (currently `border.width`, `border.radius`, `theme.*`) would be emitted as a CSS variable.
- **Key ordering is forced numerically** via `parseInt`, because JS object iteration puts integer-like keys first and the grey ramp runs `"000"` to `"1000"`.
- **A new token group needs a new emit loop in `build.mjs`.** The alpha groups (`ink`, `paper`, `accent`) and data sets (`sequence-on-light`, `sequence-on-dark`) are hardcoded lists in the emitter.
- **Not everything in `tokens.json` reaches the CSS.** `status.*.icon`, `data.supplied` and `data.hue-path` are metadata: the icon names are guidance for implementers, the other two feed only the specimen.
- **Adding a colour usually means adding a `contrast.assert` entry** for the role it is meant to play. The assertion list is the system's regression suite.

## Data sweep semantics

`sequence-on-light` and `sequence-on-dark` are **sequential only**. The hues are analogous and cannot be distinguished reliably enough for categorical encoding. Pick the variant matching the chart background, not the page theme. Adjacent steps clear 1.2:1 in both variants, the practical floor for touching areas.
