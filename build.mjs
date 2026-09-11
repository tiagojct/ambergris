// Ambergris token build. No dependencies. node build.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const T = JSON.parse(readFileSync(new URL("./tokens.json", import.meta.url), "utf8"));
const P = T.meta.prefix;
const OUT = T.meta.name.toLowerCase();

// JS puts integer-like keys first; force numeric order and drop prose keys
const ordered = (obj) =>
  Object.entries(obj)
    .filter(([k]) => k !== "comment")
    .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10));

const at = (p) => p.split(".").reduce((o, k) => (o == null ? o : o[k]), T);

function resolve(value, depth = 0) {
  if (typeof value !== "string") return value;
  if (depth > 12) throw new Error("Alias cycle near: " + value);
  const out = value.replace(/\{([^}]+)\}/g, (_, p) => {
    let v = at(p.trim());
    if (v == null) throw new Error("Unknown token: " + p);
    if (typeof v === "object" && v.hex) v = v.hex;
    if (typeof v !== "string") throw new Error("Alias is not scalar: " + p);
    return v;
  });
  return out === value ? out : resolve(out, depth + 1);
}

// --- contrast ------------------------------------------------------------
const chan = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const relLum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
};
const ratio = (a, b) => {
  const [x, y] = [relLum(a), relLum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

let failed = 0;
for (const a of T.contrast.assert) {
  const fg = resolve(a.fg), bg = resolve(a.bg), r = ratio(fg, bg);
  const ok = r >= a.min;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${fg} on ${bg}  ${r.toFixed(2)} (min ${a.min})  ${a.why || ""}`);
}
if (failed) {
  console.error(`\n${failed} assertion(s) failed. Build rejected.`);
  process.exit(1);
}

// --- emit css ------------------------------------------------------------
const L = [];
const push = (s = "") => L.push(s);

push(`/* ${T.meta.name} v${T.meta.version}`);
push(`   ${T.meta.description}`);
T.meta.rules.forEach((r) => push(`   - ${r}`));
push(`   Generated from tokens.json. Do not edit by hand. */`);
push();
push(":root {");

push(`  /* grey ramp, hue ${T.meta.greyHue} */`);
for (const [k, v] of ordered(T.color.grey)) push(`  --${P}-grey-${k}: ${v.hex};`);
push();
push(`  /* accent ramp, hue ${T.meta.accentHue}. interaction only */`);
for (const [k, v] of ordered(T.color.accent)) push(`  --${P}-accent-${k}: ${v.hex};`);
push();
push(`  /* overlays */`);
for (const g of ["ink", "paper", "accent"])
  for (const [k, v] of ordered(T.color.alpha[g])) push(`  --${P}-${g}-${k}: ${v};`);
push();
push(`  /* sequential data scales. never interface chrome */`);
for (const set of ["sequence-on-light", "sequence-on-dark"])
  for (const [k, v] of ordered(T.data[set])) push(`  --${P}-${set}-${k}: ${v.hex};`);
push();
push(`  /* structure */`);
for (const [k, v] of Object.entries(T.border.width)) push(`  --${P}-border-${k}: ${v};`);
for (const [k, v] of Object.entries(T.border.radius)) push(`  --${P}-radius-${k}: ${v};`);
push(`  --${P}-focus-width: ${T.focus.width};`);
push(`  --${P}-focus-offset: ${T.focus.offset};`);
push();
push(`  /* elevation */`);
for (const [k, v] of Object.entries(T.shadow)) {
  if (k === "comment") continue;
  push(`  --${P}-shadow-${k}: ${resolve(v)};`);
}
push();
push(`  /* status: weight, edge and fill carry severity. never hue */`);
for (const [name, s] of Object.entries(T.status)) {
  if (name === "comment") continue;
  push(`  --${P}-status-${name}-weight: ${resolve(s.weight)};`);
  push(`  --${P}-status-${name}-edge: ${s.edge};`);
  push(`  --${P}-status-${name}-fill: ${resolve(s.fill)};`);
  push(`  --${P}-status-${name}-accent: ${resolve(s.accent)};`);
}
push("}");

const theme = (mode, ind = "  ") =>
  Object.entries(T.theme[mode]).map(([k, v]) => `${ind}--${P}-${k}: ${resolve(v)};`).join("\n");

push();
push(`:root, [data-theme="light"] {`);
push(theme("light"));
push(`  color-scheme: light;`);
push("}");
push();
push(`[data-theme="dark"] {`);
push(theme("dark"));
push(`  color-scheme: dark;`);
push("}");
push();
push(`@media (prefers-color-scheme: dark) {`);
push(`  :root:not([data-theme="light"]) {`);
push(theme("dark", "    "));
push(`    color-scheme: dark;`);
push(`  }`);
push("}");
push();
push(`/* wide gamut: same ramps, unclipped */`);
push(`@supports (color: oklch(0 0 0)) {`);
push(`  :root {`);
for (const [k, v] of ordered(T.color.grey)) push(`    --${P}-grey-${k}: ${v.oklch};`);
for (const [k, v] of ordered(T.color.accent)) push(`    --${P}-accent-${k}: ${v.oklch};`);
for (const set of ["sequence-on-light", "sequence-on-dark"])
  for (const [k, v] of ordered(T.data[set])) push(`    --${P}-${set}-${k}: ${v.oklch};`);
push(`  }`);
push("}");
push();
push(`/* primitives */`);
push(`*:focus-visible {`);
push(`  outline: none;`);
push(`  box-shadow: 0 0 0 var(--${P}-focus-offset) var(--${P}-focus-halo),`);
push(`              0 0 0 calc(var(--${P}-focus-offset) + var(--${P}-focus-width)) var(--${P}-focus-ring);`);
push("}");
push(`a { color: var(--${P}-link); text-decoration-color: var(--${P}-accent-line); text-underline-offset: 0.18em; }`);
push(`a:hover { color: var(--${P}-link-hover); text-decoration-color: currentColor; }`);
push(`hr, .${P}-rule { border: 0; border-top: var(--${P}-border-hair) solid var(--${P}-rule); }`);
push(`::selection { background: var(--${P}-selection-fill); color: var(--${P}-selection-text); }`);
push();
push(`@media (prefers-reduced-motion: reduce) {`);
push(`  *, *::before, *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }`);
push("}");

writeFileSync(new URL(`./${OUT}.css`, import.meta.url), L.join("\n") + "\n");
console.log(`\nWrote ${OUT}.css (${L.length} lines).`);

// --- ports ---------------------------------------------------------------
// Dark-only exports for Ghostty, Zed, Firefox and Mastodon. Rule 4 applies:
// ansi.* hues appear only as terminal/editor content, never as chrome.

const G = (k) => T.color.grey[k].hex;
const A = (k) => T.color.accent[k].hex;
const ANSI = (k) => {
  const v = T.ansi[k];
  return typeof v === "string" ? resolve(v) : v.hex;
};
const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
// flatten fg at opacity a over bg (apps that need opaque colours)
const blend = (fg, a, bg) =>
  "#" + rgbOf(fg).map((c, i) => Math.round(c * a + rgbOf(bg)[i] * (1 - a)).toString(16).padStart(2, "0").toUpperCase()).join("");
const alphaHex = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, "0").toUpperCase();
const genNote = `Generated from tokens.json (${T.meta.name} v${T.meta.version}). Do not edit by hand.`;

const ANSI16 = [
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "bright-black", "bright-red", "bright-green", "bright-yellow", "bright-blue", "bright-magenta", "bright-cyan", "bright-white",
];

// Ghostty ----------------------------------------------------------------
{
  mkdirSync(new URL("./ports/ghostty/", import.meta.url), { recursive: true });
  const g = [];
  g.push(`# ${T.meta.name} Dark for Ghostty`);
  g.push(`# ${genNote}`);
  ANSI16.forEach((k, i) => g.push(`palette = ${i}=${ANSI(k)}`));
  g.push(`background = ${G("1000")}`);
  g.push(`foreground = ${G("100")}`);
  // cursor marks where the keyboard is: achromatic, like the focus ring
  g.push(`cursor-color = ${G("000")}`);
  g.push(`cursor-text = ${G("1000")}`);
  // selection is interaction: accent at the selection-fill opacity, flattened
  g.push(`selection-background = ${blend(A("500"), 0.24, G("1000"))}`);
  g.push(`selection-foreground = ${G("000")}`);
  writeFileSync(new URL("./ports/ghostty/ambergris-dark", import.meta.url), g.join("\n") + "\n");
  console.log("Wrote ports/ghostty/ambergris-dark.");
}

// Zed --------------------------------------------------------------------
{
  mkdirSync(new URL("./ports/zed/", import.meta.url), { recursive: true });
  const style = {};

  style["background.appearance"] = "opaque";
  style["background"] = G("1000");
  style["surface.background"] = G("950");
  style["elevated_surface.background"] = G("900");
  style["panel.background"] = G("950");
  style["panel.focused_border"] = G("000");
  style["pane.focused_border"] = G("000");
  style["pane_group.border"] = G("800");
  style["tab_bar.background"] = G("950");
  style["tab.active_background"] = G("1000");
  style["tab.inactive_background"] = G("950");
  style["toolbar.background"] = G("1000");
  style["title_bar.background"] = G("950");
  style["title_bar.inactive_background"] = G("1000");
  style["status_bar.background"] = G("950");

  style["border"] = G("800");
  style["border.variant"] = G("900");
  style["border.focused"] = G("000");
  style["border.selected"] = A("500");
  style["border.transparent"] = "#00000000";
  style["border.disabled"] = G("900");

  style["element.background"] = G("950");
  style["element.hover"] = alphaHex(G("000"), 0.04);
  style["element.active"] = alphaHex(G("000"), 0.08);
  style["element.selected"] = alphaHex(A("500"), 0.14);
  style["element.disabled"] = G("950");
  style["ghost_element.background"] = "#00000000";
  style["ghost_element.hover"] = alphaHex(G("000"), 0.04);
  style["ghost_element.active"] = alphaHex(G("000"), 0.08);
  style["ghost_element.selected"] = alphaHex(A("500"), 0.14);
  style["ghost_element.disabled"] = "#00000000";
  style["drop_target.background"] = alphaHex(G("000"), 0.08);

  style["text"] = G("100");
  style["text.muted"] = G("400");
  style["text.placeholder"] = G("500");
  style["text.disabled"] = G("700");
  style["text.accent"] = A("400");
  style["icon"] = G("300");
  style["icon.muted"] = G("500");
  style["icon.disabled"] = G("700");
  style["icon.placeholder"] = G("500");
  style["icon.accent"] = A("400");

  style["link_text.hover"] = A("300");
  style["search.match_background"] = alphaHex(A("500"), 0.14);
  style["scrollbar.thumb.background"] = alphaHex(G("000"), 0.08);
  style["scrollbar.thumb.hover_background"] = alphaHex(G("000"), 0.12);
  style["scrollbar.thumb.border"] = "#00000000";
  style["scrollbar.track.background"] = "#00000000";
  style["scrollbar.track.border"] = "#00000000";

  style["editor.background"] = G("1000");
  style["editor.foreground"] = G("100");
  style["editor.gutter.background"] = G("1000");
  style["editor.subheader.background"] = G("950");
  style["editor.active_line.background"] = alphaHex(G("000"), 0.04);
  style["editor.highlighted_line.background"] = alphaHex(A("500"), 0.08);
  style["editor.line_number"] = G("700");
  style["editor.active_line_number"] = G("100");
  style["editor.invisible"] = G("800");
  style["editor.wrap_guide"] = alphaHex(G("000"), 0.04);
  style["editor.active_wrap_guide"] = alphaHex(G("000"), 0.08);
  style["editor.document_highlight.read_background"] = alphaHex(A("500"), 0.08);
  style["editor.document_highlight.write_background"] = alphaHex(A("500"), 0.14);

  // diagnostics and vcs: the one sanctioned home of the functional hues
  const statusHues = {
    conflict: ANSI("magenta"), created: ANSI("green"), deleted: ANSI("red"),
    error: ANSI("red"), hidden: G("600"), hint: G("500"), ignored: G("600"),
    info: ANSI("blue"), modified: ANSI("yellow"), predictive: G("700"),
    renamed: ANSI("blue"), success: ANSI("green"), unreachable: G("500"),
    warning: ANSI("yellow"),
  };
  for (const [k, c] of Object.entries(statusHues)) {
    style[k] = c;
    style[`${k}.background`] = alphaHex(c, 0.14);
    style[`${k}.border`] = alphaHex(c, 0.24);
  }

  style["terminal.background"] = G("1000");
  style["terminal.foreground"] = G("100");
  style["terminal.bright_foreground"] = G("000");
  style["terminal.dim_foreground"] = G("500");
  for (const k of ANSI16) {
    const zk = k.replace("bright-", "bright_");
    style[`terminal.ansi.${zk}`] = ANSI(k);
    if (!k.startsWith("bright-")) style[`terminal.ansi.dim_${zk}`] = blend(ANSI(k), 0.65, G("1000"));
  }

  // player 0 is the local cursor: achromatic, selection carries the accent
  const playerHues = [G("000"), A("400"), ANSI("blue"), ANSI("magenta"), ANSI("green"), ANSI("yellow"), ANSI("red"), G("500")];
  style["players"] = playerHues.map((c, i) => ({
    cursor: c,
    background: c,
    selection: alphaHex(i === 0 ? A("500") : c, 0.24),
  }));

  // syntax: hierarchy by lightness, weight and slant, never hue
  const syn = (color, extra = {}) => ({ color, font_style: null, font_weight: null, ...extra });
  style["syntax"] = {
    "attribute": syn(G("300")),
    "boolean": syn(G("200")),
    "comment": syn(G("500"), { font_style: "italic" }),
    "comment.doc": syn(G("500"), { font_style: "italic" }),
    "constant": syn(G("200")),
    "constructor": syn(G("100"), { font_weight: 600 }),
    "embedded": syn(G("100")),
    "emphasis": syn(G("100"), { font_style: "italic" }),
    "emphasis.strong": syn(G("100"), { font_weight: 700 }),
    "enum": syn(G("200")),
    "function": syn(G("000"), { font_weight: 600 }),
    "hint": syn(G("500")),
    "keyword": syn(G("200"), { font_weight: 700 }),
    "label": syn(G("300")),
    "link_text": syn(A("400")),
    "link_uri": syn(A("400")),
    "number": syn(G("200")),
    "operator": syn(G("400")),
    "predictive": syn(G("700"), { font_style: "italic" }),
    "preproc": syn(G("300")),
    "primary": syn(G("100")),
    "property": syn(G("300")),
    "punctuation": syn(G("500")),
    "punctuation.bracket": syn(G("500")),
    "punctuation.delimiter": syn(G("500")),
    "punctuation.list_marker": syn(G("300")),
    "punctuation.special": syn(G("400")),
    "string": syn(G("300"), { font_style: "italic" }),
    "string.escape": syn(G("400")),
    "string.regex": syn(G("300")),
    "string.special": syn(G("400")),
    "string.special.symbol": syn(G("300")),
    "tag": syn(G("100")),
    "text.literal": syn(G("300")),
    "title": syn(G("000"), { font_weight: 700 }),
    "type": syn(G("200"), { font_weight: 600 }),
    "variable": syn(G("100")),
    "variable.special": syn(G("200"), { font_style: "italic" }),
  };

  const family = {
    $schema: "https://zed.dev/schema/themes/v0.2.0.json",
    name: T.meta.name,
    author: "Tiago Jacinto",
    themes: [{ name: `${T.meta.name} Dark`, appearance: "dark", style }],
  };
  writeFileSync(new URL("./ports/zed/ambergris.json", import.meta.url), JSON.stringify(family, null, 2) + "\n");
  console.log("Wrote ports/zed/ambergris.json.");
}

// Firefox ----------------------------------------------------------------
{
  mkdirSync(new URL("./ports/firefox/", import.meta.url), { recursive: true });
  const paperA = (a) => `rgba(${rgbOf(G("000")).join(", ")}, ${a})`;
  const accentA = (a) => `rgba(${rgbOf(A("500")).join(", ")}, ${a})`;
  const manifest = {
    manifest_version: 2,
    name: `${T.meta.name} Dark`,
    version: T.meta.version,
    description: `${T.meta.description} ${genNote}`,
    author: "Tiago Jacinto",
    browser_specific_settings: { gecko: { id: "ambergris@tiagojct.eu" } },
    theme: {
      properties: { color_scheme: "dark", content_color_scheme: "dark" },
      colors: {
        frame: G("1000"),
        frame_inactive: G("1000"),
        toolbar: G("950"),
        toolbar_text: G("100"),
        bookmark_text: G("100"),
        tab_selected: G("950"),
        tab_text: G("100"),
        tab_background_text: G("400"),
        tab_line: A("500"),
        toolbar_field: G("1000"),
        toolbar_field_text: G("100"),
        toolbar_field_border: G("900"),
        toolbar_field_focus: G("950"),
        toolbar_field_text_focus: G("000"),
        toolbar_field_border_focus: G("000"),
        toolbar_field_highlight: accentA(0.24),
        toolbar_field_highlight_text: G("000"),
        toolbar_top_separator: G("1000"),
        toolbar_bottom_separator: G("900"),
        toolbar_vertical_separator: G("900"),
        icons: G("400"),
        icons_attention: A("400"),
        button_background_hover: paperA(0.06),
        button_background_active: paperA(0.1),
        popup: G("900"),
        popup_text: G("100"),
        popup_border: G("800"),
        popup_highlight: accentA(0.24),
        popup_highlight_text: G("000"),
        sidebar: G("950"),
        sidebar_text: G("100"),
        sidebar_border: G("900"),
        sidebar_highlight: accentA(0.24),
        sidebar_highlight_text: G("000"),
        ntp_background: G("1000"),
        ntp_text: G("100"),
      },
    },
  };
  writeFileSync(new URL("./ports/firefox/manifest.json", import.meta.url), JSON.stringify(manifest, null, 2) + "\n");
  console.log("Wrote ports/firefox/manifest.json.");
}

// Mastodon ---------------------------------------------------------------
{
  const tplUrl = new URL("./ports/mastodon/tangerine-template.css", import.meta.url);
  const tpl = readFileSync(tplUrl, "utf8");
  const gv = JSON.parse(readFileSync(new URL("./ports/mastodon/tangerine-granite.values.json", import.meta.url), "utf8"));
  const low = (h) => h.slice(1).toLowerCase();
  const rgbStr = (hex) => rgbOf(hex).join(", ");
  const v = { ...gv };

  // icon slots: base icons are achromatic (the granite precedent), active /
  // checked states are current-item, so they take the accent (rule 1). The
  // slot number says which mode's data-URI it is: light runs to _459, dark
  // from _464, with collections split across _245/_250.
  for (const k of Object.keys(gv)) {
    if (!k.startsWith("icon-") && !k.startsWith("logo_")) continue;
    if (k.startsWith("icon-olympics") || k.startsWith("logo_")) continue; // composite, recoloured below
    const n = parseInt(k.slice(k.lastIndexOf("_") + 1), 10);
    const dark = n >= 464 || k === "icon-collections-accent_250";
    const active = /-active|check-radio|check-box/.test(k);
    v[k] = active ? low(dark ? A("400") : A("600")) : low(dark ? G("300") : G("950"));
  }
  // composite SVG slots keep granite's geometry, recoloured to our greys
  for (const [k, from, to] of [
    ["logo_260", "1f2127", G("950")],
    ["icon-olympics_458", "1f2127", G("950")],
    ["logo_464", "c9cdd6", G("300")],
    ["icon-olympics_641", "c9cdd6", G("300")],
  ]) v[k] = gv[k].replaceAll(from, low(to));

  Object.assign(v, {
    "variant-name_12": T.meta.name,
    "variant-emoji_13": "311", // \1F311, the new moon: dark and achromatic
    // light block
    "color-bg_23": low(G("050")),
    "color-fg-muted_26": low(G("600")),
    "color-secondary-bg_27": low(G("100")),
    "color-secondary-separator_28": low(G("200")),
    "color-content-secondary-bg_34": low(G("050")),
    "color-content-secondary-separator_35": rgbStr(G("200")),
    "color-accent_38": low(A("600")),
    "color-accent-focus_39": low(A("500")),
    "color-accent-lines_40": `${rgbStr(A("500"))}, 0.12`,
    "color-accent-bg_41": low(A("050")),
    "color-accent-fg_43": low(G("000")),
    // dark block, the designed target
    "color-fg_62": low(G("100")),
    "color-fg-muted_63": low(G("500")),
    "color-secondary-bg_64": low(G("950")),
    "color-secondary-separator_65": low(G("900")),
    "color-content-secondary-separator_72": rgbStr(G("800")),
    "color-accent_75": low(A("400")),
    "color-accent-focus_76": low(A("300")),
    "color-accent-lines_77": rgbStr(A("400")),
    "color-accent-bg_78": low(A("900")),
    "color-accent-fg_80": low(G("1000")),
    // high-contrast blocks: push the accent to its ramp extremes
    ...Object.fromEntries(
      ["color-text-brand_172", "color-text-status-links_173", "color-bg-brand-base_175", "color-border-brand_176",
       "color-text-brand_190", "color-text-status-links_191", "color-bg-brand-base_193", "color-border-brand_194",
      ].map((k) => [k, low(A("800"))])
    ),
    ...Object.fromEntries(
      ["color-text-brand_209", "color-text-status-links_210", "color-bg-brand-base_212", "color-border-brand_213",
       "color-text-brand_227", "color-text-status-links_228", "color-bg-brand-base_230", "color-border-brand_231",
      ].map((k) => [k, low(A("200"))])
    ),
  });

  let css = tpl.replace(/\{\{([^}]+)\}\}/g, (_, k) => {
    if (!(k in v)) throw new Error("mastodon: no value for slot " + k);
    return v[k];
  });
  if (/\{\{[^}]+\}\}/.test(css)) throw new Error("mastodon: unfilled placeholder survived");

  // refinements: hand-written CSS with @{token.path} aliases
  const refSrc = readFileSync(new URL("./ports/mastodon/refinements.css", import.meta.url), "utf8");
  const refinements = refSrc.replace(/@\{([^}]+)\}/g, (_, p) => resolve(`{${p}}`));

  const header = [
    `/*  ${T.meta.name} UI for Mastodon (dark) v${T.meta.version}`,
    `    ${T.meta.description}`,
    `    ${genNote}`,
    `    Base: Tangerine Neue for Mastodon (MIT, (c) 2025 Nileane Dorffer),`,
    `    recoloured from tokens.json with an Ambergris refinement layer appended.`,
    `    Install: Administration > Server settings > Appearance > Custom CSS. */`,
    "", "",
  ].join("\n");
  writeFileSync(new URL("./ports/mastodon/AmbergrisUI.css", import.meta.url), header + css + "\n" + refinements);
  console.log("Wrote ports/mastodon/AmbergrisUI.css.");
}

// --- specimen ------------------------------------------------------------
const grey = ordered(T.color.grey);
const acc = ordered(T.color.accent);
const light = T.color.grey["000"].hex, dark = T.color.grey["1000"].hex, surfD = T.color.grey["950"].hex;
const strip = (o) => o.replace("oklch(", "").replace(")", "");

const data = {
  name: T.meta.name,
  version: T.meta.version,
  greyHue: T.meta.greyHue,
  accentHue: T.meta.accentHue,
  ink: dark,
  paper: light,
  steps: grey.map(([name, v]) => ({
    name, hex: v.hex, oklch: strip(v.oklch),
    vsLight: +ratio(v.hex, light).toFixed(3),
    vsDark: +ratio(v.hex, dark).toFixed(3),
    onLight: ratio(v.hex, dark) >= ratio(v.hex, light)
  })),
  accent: acc.map(([name, v]) => ({
    name, hex: v.hex, oklch: strip(v.oklch),
    vsLight: +ratio(v.hex, light).toFixed(3),
    vsDark: +ratio(v.hex, surfD).toFixed(3),
    onLight: ratio(v.hex, dark) >= ratio(v.hex, light)
  })),
  matrix: grey.map(([, a]) => grey.map(([, b]) => +ratio(a.hex, b.hex).toFixed(3))),
  seqLight: ordered(T.data["sequence-on-light"]).map(([, v]) => v.hex),
  seqDark: ordered(T.data["sequence-on-dark"]).map(([, v]) => v.hex),
  supplied: T.data.supplied,
  huePath: T.data["hue-path"]
};

const css = readFileSync(new URL(`./${OUT}.css`, import.meta.url), "utf8");
let spec = readFileSync(new URL("./specimen.src.html", import.meta.url), "utf8");
spec = spec.replace("/* @TOKENS@ */", css).replace("/* @DATA@ */", JSON.stringify(data));
writeFileSync(new URL("./specimen.html", import.meta.url), spec);
console.log(`Wrote specimen.html (self-contained, ${(spec.length / 1024).toFixed(0)} kB).`);
