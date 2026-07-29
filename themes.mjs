// Ambergris application themes. Called by build.mjs; no dependencies.
// One role vocabulary (tokens.editor) rendered into five host formats.
import { mkdirSync, writeFileSync } from "node:fs";
import { zip } from "./zip.mjs";

// --- colour plumbing -----------------------------------------------------
const parseColor = (s) => {
  if (s[0] === "#") {
    const h = s.slice(1);
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    };
  }
  const m = s.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\s*\)$/);
  if (!m) throw new Error("Cannot parse colour: " + s);
  return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };
};

const h2 = (n) => Math.round(n).toString(16).padStart(2, "0");
const hex6 = (c) => `#${h2(c.r)}${h2(c.g)}${h2(c.b)}`;
const hex8 = (c) => `#${h2(c.r)}${h2(c.g)}${h2(c.b)}${h2(c.a * 255)}`;
const over = (fg, bg) => ({
  r: fg.r * fg.a + bg.r * (1 - fg.a),
  g: fg.g * fg.a + bg.g * (1 - fg.a),
  b: fg.b * fg.a + bg.b * (1 - fg.a),
  a: 1
});

const triplet = (c) => `${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}`;

const toHsl = ({ r, g, b }) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
};

// --- palette -------------------------------------------------------------
function palette(T, resolve, mode) {
  // lowercase throughout: hex6/hex8 emit lowercase, tokens.json stores uppercase,
  // and a theme file that mixes the two reads like two files stapled together
  const raw = {}, ansi = {};
  for (const [k, v] of Object.entries(T.editor[mode])) raw[k] = resolve(v).toLowerCase();
  for (const [k, v] of Object.entries(T.terminal[mode])) ansi[k] = resolve(v).toLowerCase();
  const canvas = parseColor(raw.canvas);
  const flat = (k) => hex6(over(parseColor(raw[k]), canvas)); // alpha composited onto the canvas
  return {
    mode,
    dark: mode === "dark",
    css: (k) => raw[k],                       // keep alpha; CSS hosts understand rgb()
    hex8: (k) => hex8(parseColor(raw[k])),    // Zed and VS Code take #rrggbbaa
    hex: (k) => hex6(parseColor(raw[k])),     // opaque roles only
    flat,                                     // for hosts with no alpha channel
    ansi: (k) => ansi[k],
    ansiKeys: Object.keys(ansi),
    style: (k) => T.editor.style[k],
    italic: (k) => T.editor.style[k] === "italic",
    bold: (k) => T.editor.style[k] === "bold",
    rgb: (k) => triplet(parseColor(raw[k])),   // Obsidian callouts want a bare triplet
    flatOn: (k, base) => hex6(over(parseColor(raw[k]), parseColor(raw[base]))),
    roles: () => Object.keys(raw),
    all: () => ({ ...raw }),
    allAnsi: () => ({ ...ansi })
  };
}

// One ordinal ladder, read two ways. Headings and chart series want it monotone;
// bracket nesting wants adjacent levels far apart, so it reads 1,4,2,5,3,6.
const DEPTH = ["depth-1", "depth-2", "depth-3", "depth-4", "depth-5", "depth-6"];
const BRACKET = [0, 3, 1, 4, 2, 5].map((i) => DEPTH[i]);

// --- Zed -----------------------------------------------------------------
// syntax key -> role. Key list is Zed's own (assets/themes/one/one.json).
const ZED_SYNTAX = {
  attribute: "syn-attribute", boolean: "syn-constant", comment: "syn-comment",
  "comment.doc": "syn-doc", constant: "syn-constant", constructor: "syn-function",
  embedded: "syn-fg", emphasis: "syn-emphasis", "emphasis.strong": "syn-strong",
  enum: "syn-type", function: "syn-function", hint: "syn-hint", keyword: "syn-keyword",
  label: "syn-label", link_text: "syn-link-text", link_uri: "syn-link-uri",
  namespace: "syn-namespace", number: "syn-number", operator: "syn-operator",
  predictive: "syn-predictive", preproc: "syn-preproc", primary: "syn-fg",
  property: "syn-property", punctuation: "syn-punct",
  "punctuation.bracket": "syn-punct", "punctuation.delimiter": "syn-punct",
  "punctuation.list_marker": "syn-list-marker", "punctuation.markup": "syn-punct",
  "punctuation.special": "syn-punct-special", selector: "syn-type",
  "selector.pseudo": "syn-attribute", string: "syn-string",
  "string.escape": "syn-string-escape", "string.regex": "syn-string-escape",
  "string.special": "syn-string-escape", "string.special.symbol": "syn-constant",
  tag: "syn-tag", "text.literal": "syn-literal", title: "syn-title", type: "syn-type",
  variable: "syn-variable", "variable.parameter": "syn-parameter",
  "variable.special": "syn-constant", variant: "syn-constant",
  "diff.plus": "diff-added", "diff.minus": "diff-removed"
};

function zedStyle(p) {
  const c = (k) => p.hex8(k);
  const t = (k) => hex8(parseColor(p.ansi(k))); // Zed's own themes are 8-digit throughout
  const syntax = {};
  for (const [key, role] of Object.entries(ZED_SYNTAX)) {
    const e = { color: c(role), font_style: null, font_weight: null };
    if (p.italic(role)) e.font_style = "italic";
    if (p.bold(role)) e.font_weight = 700;
    syntax[key] = e;
  }
  const player = (cursor, sel) => ({ cursor: c(cursor), background: c(cursor), selection: c(sel) });
  return {
    background: c("canvas-panel"),
    "background.appearance": "opaque",
    border: c("border"),
    "border.variant": c("border"),
    "border.focused": c("accent-line"),
    "border.selected": c("border-strong"),
    "border.transparent": "#00000000",
    "border.disabled": c("border"),
    "elevated_surface.background": c("canvas-raised"),
    "surface.background": c("canvas-panel"),
    "element.background": c("canvas-panel"),
    "element.hover": c("line-highlight"),
    "element.active": c("selection-inactive"),
    "element.selected": c("accent-surface"),
    "element.disabled": c("canvas-panel"),
    "drop_target.background": c("accent-surface"),
    "ghost_element.background": "#00000000",
    "ghost_element.hover": c("line-highlight"),
    "ghost_element.active": c("selection-inactive"),
    "ghost_element.selected": c("accent-surface"),
    "ghost_element.disabled": "#00000000",
    text: c("fg"),
    "text.muted": c("fg-muted"),
    "text.placeholder": c("fg-faint"),
    "text.disabled": c("fg-disabled"),
    "text.accent": c("accent"),
    icon: c("fg"),
    "icon.muted": c("fg-muted"),
    "icon.disabled": c("fg-disabled"),
    "icon.placeholder": c("fg-faint"),
    "icon.accent": c("accent"),
    "status_bar.background": c("status-bar-bg"),
    "title_bar.background": c("title-bar-bg"),
    "title_bar.inactive_background": c("title-bar-bg"),
    "toolbar.background": c("canvas"),
    "tab_bar.background": c("canvas-panel"),
    "tab.inactive_background": c("tab-inactive-bg"),
    "tab.active_background": c("tab-active-bg"),
    "search.match_background": c("search-match"),
    "panel.background": c("panel-bg"),
    "panel.focused_border": c("accent-line"),
    "panel.indent_guide": c("indent-guide"),
    "panel.indent_guide_active": c("indent-guide-active"),
    "panel.indent_guide_hover": c("indent-guide-active"),
    "pane.focused_border": c("accent-line"),
    "pane_group.border": c("border"),
    "scrollbar.thumb.background": c("scrollbar"),
    "scrollbar.thumb.hover_background": c("scrollbar-hover"),
    "scrollbar.thumb.border": "#00000000",
    "scrollbar.track.background": "#00000000",
    "scrollbar.track.border": c("border"),
    "editor.foreground": c("syn-fg"),
    "editor.background": c("canvas"),
    "editor.gutter.background": c("gutter"),
    "editor.subheader.background": c("canvas-panel"),
    "editor.active_line.background": c("line-highlight"),
    "editor.highlighted_line.background": c("selection-inactive"),
    "editor.line_number": c("fg-disabled"),
    "editor.active_line_number": c("fg"),
    "editor.invisible": c("whitespace"),
    "editor.wrap_guide": c("indent-guide"),
    "editor.active_wrap_guide": c("indent-guide-active"),
    "editor.indent_guide": c("indent-guide"),
    "editor.indent_guide_active": c("indent-guide-active"),
    "editor.document_highlight.read_background": c("selection-inactive"),
    "editor.document_highlight.write_background": c("selection-inactive"),
    "editor.document_highlight.bracket_background": c("bracket-match"),
    "terminal.background": c("canvas"),
    "terminal.foreground": c("fg"),
    "terminal.bright_foreground": t("bright-white"),
    "terminal.dim_foreground": c("fg-muted"),
    "terminal.ansi.background": c("canvas"),
    "terminal.ansi.black": t("black"),
    "terminal.ansi.red": t("red"),
    "terminal.ansi.green": t("green"),
    "terminal.ansi.yellow": t("yellow"),
    "terminal.ansi.blue": t("blue"),
    "terminal.ansi.magenta": t("magenta"),
    "terminal.ansi.cyan": t("cyan"),
    "terminal.ansi.white": t("white"),
    "terminal.ansi.bright_black": t("bright-black"),
    "terminal.ansi.bright_red": t("bright-red"),
    "terminal.ansi.bright_green": t("bright-green"),
    "terminal.ansi.bright_yellow": t("bright-yellow"),
    "terminal.ansi.bright_blue": t("bright-blue"),
    "terminal.ansi.bright_magenta": t("bright-magenta"),
    "terminal.ansi.bright_cyan": t("bright-cyan"),
    "terminal.ansi.bright_white": t("bright-white"),
    "link_text.hover": c("link-hover"),
    conflict: c("diff-conflict"),
    "conflict.background": c("diff-modified-bg"),
    "conflict.border": c("border-strong"),
    created: c("diff-added"),
    "created.background": c("diff-added-bg"),
    "created.border": c("border"),
    deleted: c("diff-removed"),
    "deleted.background": c("diff-removed-bg"),
    "deleted.border": c("border"),
    modified: c("diff-modified"),
    "modified.background": c("diff-modified-bg"),
    "modified.border": c("border"),
    renamed: c("diff-modified"),
    "renamed.background": c("diff-modified-bg"),
    "renamed.border": c("border"),
    hidden: c("ignored"),
    "hidden.background": c("canvas-panel"),
    "hidden.border": c("border"),
    ignored: c("ignored"),
    "ignored.background": c("canvas-panel"),
    "ignored.border": c("border"),
    hint: c("hint"),
    "hint.background": c("line-highlight"),
    "hint.border": c("border"),
    info: c("info"),
    "info.background": c("line-highlight"),
    "info.border": c("border"),
    error: c("error"),
    "error.background": c("diff-removed-bg"),
    "error.border": c("border-strong"),
    warning: c("warning"),
    "warning.background": c("diff-modified-bg"),
    "warning.border": c("border-strong"),
    success: c("success"),
    "success.background": c("diff-added-bg"),
    "success.border": c("border"),
    predictive: c("syn-predictive"),
    "predictive.background": "#00000000",
    "predictive.border": c("border"),
    unreachable: c("fg-disabled"),
    "unreachable.background": "#00000000",
    "unreachable.border": c("border"),
    players: [
      player("caret", "selection"),
      player("fg", "selection-inactive"),
      player("fg-muted", "selection-inactive"),
      player("fg-faint", "selection-inactive")
    ],
    syntax
  };
}

function writeZed(dir, T, L, D) {
  const body = {
    $schema: "https://zed.dev/schema/themes/v0.2.0.json",
    name: T.meta.name,
    author: T.meta.author,
    themes: [
      { name: `${T.meta.name} Light`, appearance: "light", style: zedStyle(L) },
      { name: `${T.meta.name} Dark`, appearance: "dark", style: zedStyle(D) }
    ]
  };
  writeFileSync(new URL("ambergris.json", dir), JSON.stringify(body, null, 2) + "\n");
  return ["zed/ambergris.json"];
}

// --- VS Code -------------------------------------------------------------
const TM_SCOPES = [
  ["Comment", ["comment", "punctuation.definition.comment"], "syn-comment"],
  ["Documentation comment", ["comment.block.documentation", "comment.line.documentation"], "syn-doc"],
  ["Keyword", ["keyword", "keyword.control", "storage", "storage.type", "storage.modifier", "keyword.other"], "syn-keyword"],
  ["Operator", ["keyword.operator"], "syn-operator"],
  ["Punctuation", ["punctuation", "punctuation.separator", "punctuation.terminator", "meta.brace"], "syn-punct"],
  ["Special punctuation", ["punctuation.section.embedded", "punctuation.definition.template-expression"], "syn-punct-special"],
  ["String", ["string", "string.quoted", "punctuation.definition.string"], "syn-string"],
  ["String escape", ["constant.character.escape", "string.regexp"], "syn-string-escape"],
  ["Number", ["constant.numeric"], "syn-number"],
  ["Constant", ["constant.language", "constant.other", "support.constant", "variable.other.constant"], "syn-constant"],
  ["Variable", ["variable", "variable.other.readwrite", "meta.definition.variable"], "syn-variable"],
  ["Property", ["variable.other.property", "variable.other.object.property", "support.type.property-name", "meta.object-literal.key"], "syn-property"],
  ["Parameter", ["variable.parameter", "meta.function.parameters"], "syn-parameter"],
  ["Function", ["entity.name.function", "support.function", "meta.function-call.generic"], "syn-function"],
  ["Type", ["entity.name.type", "entity.name.class", "support.class", "support.type", "entity.other.inherited-class"], "syn-type"],
  ["Namespace", ["entity.name.namespace", "entity.name.scope-resolution", "meta.import", "meta.export"], "syn-namespace"],
  ["Tag", ["entity.name.tag", "punctuation.definition.tag"], "syn-tag"],
  ["Attribute", ["entity.other.attribute-name"], "syn-attribute"],
  ["Label", ["entity.name.label", "variable.other.enummember"], "syn-label"],
  ["Preprocessor", ["meta.preprocessor", "keyword.control.directive", "entity.name.function.preprocessor"], "syn-preproc"],
  ["Invalid", ["invalid", "invalid.illegal"], "syn-invalid"],
  ["Heading", ["markup.heading", "entity.name.section"], "syn-title"],
  ["Bold", ["markup.bold"], "syn-strong"],
  ["Italic", ["markup.italic"], "syn-emphasis"],
  ["Inline code", ["markup.inline.raw", "markup.raw"], "syn-literal"],
  ["Quote", ["markup.quote"], "syn-quote"],
  ["List marker", ["punctuation.definition.list.begin", "markup.list"], "syn-list-marker"],
  ["Link text", ["string.other.link", "markup.underline.link.image"], "syn-link-text"],
  ["Link URI", ["markup.underline.link"], "syn-link-uri"],
  ["Diff added", ["markup.inserted"], "diff-added"],
  ["Diff removed", ["markup.deleted"], "diff-removed"],
  ["Diff changed", ["markup.changed"], "diff-modified"]
];

const SEMANTIC = {
  namespace: "syn-namespace", class: "syn-type", enum: "syn-type", interface: "syn-type",
  struct: "syn-type", typeParameter: "syn-type", type: "syn-type",
  parameter: "syn-parameter", variable: "syn-variable", property: "syn-property",
  enumMember: "syn-constant", decorator: "syn-attribute", event: "syn-property",
  function: "syn-function", method: "syn-function", macro: "syn-preproc",
  keyword: "syn-keyword", modifier: "syn-keyword", comment: "syn-comment",
  string: "syn-string", number: "syn-number", regexp: "syn-string-escape",
  operator: "syn-operator"
};

// VS Code ships a great many chromatic defaults. Anything left unset here leaks
// hue into an otherwise achromatic theme; bracket pair colorization is the worst
// offender, being on by default and rainbow.
const SYMBOL_ICONS = {
  array: "syn-constant", boolean: "syn-constant", class: "syn-type", color: "syn-constant",
  constant: "syn-constant", constructor: "syn-function", enumerator: "syn-type",
  enumeratorMember: "syn-constant", event: "syn-property", field: "syn-property",
  file: "fg-muted", folder: "fg-muted", function: "syn-function", interface: "syn-type",
  key: "syn-property", keyword: "syn-keyword", method: "syn-function", module: "syn-namespace",
  namespace: "syn-namespace", null: "syn-constant", number: "syn-number", object: "syn-type",
  operator: "syn-operator", package: "syn-namespace", property: "syn-property",
  reference: "syn-variable", snippet: "syn-literal", string: "syn-string",
  struct: "syn-type", text: "syn-fg", typeParameter: "syn-type", unit: "syn-number",
  variable: "syn-variable"
};

function vscodeTheme(name, p) {
  const c = (k) => p.hex8(k);
  const spread = (prefix, roles, suffix = "") =>
    Object.fromEntries(roles.map((r, i) => [`${prefix}${i + 1}${suffix}`, c(r)]));
  const settings = (role) => {
    const s = { foreground: p.hex(role) };
    const st = p.style(role);
    if (st === "bold") s.fontStyle = "bold";
    else if (st === "italic") s.fontStyle = "italic";
    else if (st === "underline") s.fontStyle = "underline";
    return s;
  };
  const semanticTokenColors = {};
  for (const [k, role] of Object.entries(SEMANTIC)) semanticTokenColors[k] = settings(role);

  return {
    name,
    type: p.dark ? "dark" : "light",
    semanticHighlighting: true,
    colors: {
      foreground: c("fg"),
      descriptionForeground: c("fg-muted"),
      disabledForeground: c("fg-disabled"),
      errorForeground: c("error"),
      focusBorder: c("border-focus"),
      "icon.foreground": c("fg-muted"),
      "widget.shadow": c("scrim"),
      "selection.background": c("selection"),
      "textLink.foreground": c("link"),
      "textLink.activeForeground": c("link-hover"),

      "editor.background": c("canvas"),
      "editor.foreground": c("syn-fg"),
      "editor.lineHighlightBackground": c("line-highlight"),
      "editor.selectionBackground": c("selection"),
      "editor.selectionHighlightBackground": c("selection-inactive"),
      "editor.inactiveSelectionBackground": c("selection-inactive"),
      "editor.wordHighlightBackground": c("selection-inactive"),
      "editor.wordHighlightStrongBackground": c("selection-inactive"),
      "editor.findMatchBackground": c("search-match-current"),
      "editor.findMatchHighlightBackground": c("search-match"),
      "editorCursor.foreground": c("caret"),
      "editorLineNumber.foreground": c("fg-disabled"),
      "editorLineNumber.activeForeground": c("fg"),
      "editorIndentGuide.background1": c("indent-guide"),
      "editorIndentGuide.activeBackground1": c("indent-guide-active"),
      "editorWhitespace.foreground": c("whitespace"),
      "editorGutter.background": c("gutter"),
      "editorGutter.addedBackground": c("diff-added"),
      "editorGutter.modifiedBackground": c("diff-modified"),
      "editorGutter.deletedBackground": c("diff-removed"),
      "editorBracketMatch.background": c("bracket-match"),
      "editorBracketMatch.border": c("accent-line"),
      "editorRuler.foreground": c("indent-guide"),
      "editorCodeLens.foreground": c("fg-faint"),
      "editorInlayHint.foreground": c("hint"),
      "editorInlayHint.background": c("line-highlight"),
      "editorGhostText.foreground": c("syn-predictive"),
      "editorLink.activeForeground": c("link-hover"),
      "editorError.foreground": c("error"),
      "editorWarning.foreground": c("warning"),
      "editorInfo.foreground": c("info"),
      "editorHint.foreground": c("hint"),
      "editorOverviewRuler.border": c("border"),

      "editorWidget.background": c("canvas-raised"),
      "editorWidget.foreground": c("fg"),
      "editorWidget.border": c("border"),
      "editorHoverWidget.background": c("canvas-raised"),
      "editorHoverWidget.foreground": c("fg"),
      "editorHoverWidget.border": c("border"),
      "editorSuggestWidget.background": c("canvas-raised"),
      "editorSuggestWidget.foreground": c("fg"),
      "editorSuggestWidget.border": c("border"),
      "editorSuggestWidget.selectedBackground": c("accent-surface"),
      "editorSuggestWidget.highlightForeground": c("accent"),

      "editorGroup.border": c("border"),
      "editorGroupHeader.tabsBackground": c("canvas-panel"),
      "editorGroupHeader.noTabsBackground": c("canvas-panel"),
      "tab.activeBackground": c("tab-active-bg"),
      "tab.activeForeground": c("fg"),
      "tab.inactiveBackground": c("tab-inactive-bg"),
      "tab.inactiveForeground": c("fg-muted"),
      "tab.border": c("border"),
      "tab.activeBorderTop": c("accent-line"),

      "sideBar.background": c("canvas-panel"),
      "sideBar.foreground": c("fg-muted"),
      "sideBar.border": c("border"),
      "sideBarTitle.foreground": c("fg"),
      "sideBarSectionHeader.background": c("canvas-panel"),
      "sideBarSectionHeader.foreground": c("fg"),
      "activityBar.background": c("canvas-panel"),
      "activityBar.foreground": c("fg"),
      "activityBar.inactiveForeground": c("fg-faint"),
      "activityBar.border": c("border"),
      "activityBar.activeBorder": c("accent-line"),
      "activityBarBadge.background": c("accent"),
      "activityBarBadge.foreground": c("fg-on-fill"),

      "statusBar.background": c("status-bar-bg"),
      "statusBar.foreground": c("fg-muted"),
      "statusBar.border": c("border"),
      "statusBar.noFolderBackground": c("status-bar-bg"),
      "statusBar.debuggingBackground": c("canvas-raised"),
      "statusBarItem.remoteBackground": c("canvas-raised"),
      "statusBarItem.remoteForeground": c("fg"),
      "titleBar.activeBackground": c("title-bar-bg"),
      "titleBar.activeForeground": c("fg"),
      "titleBar.inactiveBackground": c("title-bar-bg"),
      "titleBar.inactiveForeground": c("fg-faint"),
      "titleBar.border": c("border"),

      "panel.background": c("panel-bg"),
      "panel.border": c("border"),
      "panelTitle.activeForeground": c("fg"),
      "panelTitle.inactiveForeground": c("fg-muted"),
      "panelTitle.activeBorder": c("accent-line"),

      "list.activeSelectionBackground": c("accent-surface"),
      "list.activeSelectionForeground": c("fg"),
      "list.inactiveSelectionBackground": c("selection-inactive"),
      "list.hoverBackground": c("line-highlight"),
      "list.focusBackground": c("accent-surface"),
      "list.highlightForeground": c("accent"),
      "list.errorForeground": c("error"),
      "list.warningForeground": c("warning"),

      "input.background": c("canvas"),
      "input.foreground": c("fg"),
      "input.border": c("border-strong"),
      "input.placeholderForeground": c("fg-faint"),
      "inputOption.activeBorder": c("accent-line"),
      "inputOption.activeBackground": c("accent-surface"),
      "dropdown.background": c("canvas-raised"),
      "dropdown.foreground": c("fg"),
      "dropdown.border": c("border-strong"),
      "button.background": c("accent"),
      "button.foreground": c("fg-on-fill"),
      "button.hoverBackground": c("link-hover"),
      "button.secondaryBackground": c("canvas-raised"),
      "button.secondaryForeground": c("fg"),
      "badge.background": c("accent-fill"),
      "badge.foreground": c("fg"),

      "scrollbarSlider.background": c("scrollbar"),
      "scrollbarSlider.hoverBackground": c("scrollbar-hover"),
      "scrollbarSlider.activeBackground": c("scrollbar-hover"),
      "minimap.background": c("canvas"),
      "minimapSlider.background": c("scrollbar"),
      "breadcrumb.background": c("canvas"),
      "breadcrumb.foreground": c("fg-muted"),
      "breadcrumb.focusForeground": c("fg"),

      "quickInput.background": c("canvas-raised"),
      "quickInput.foreground": c("fg"),
      "quickInputList.focusBackground": c("accent-surface"),
      "menu.background": c("canvas-raised"),
      "menu.foreground": c("fg"),
      "menu.border": c("border"),
      "menu.selectionBackground": c("accent-surface"),
      "notifications.background": c("canvas-raised"),
      "notifications.border": c("border"),
      "notificationCenterHeader.background": c("canvas-panel"),

      "peekView.border": c("accent-line"),
      "peekViewEditor.background": c("canvas-sunken"),
      "peekViewResult.background": c("canvas-panel"),
      "diffEditor.insertedTextBackground": c("diff-added-bg"),
      "diffEditor.removedTextBackground": c("diff-removed-bg"),

      "gitDecoration.addedResourceForeground": c("diff-added"),
      "gitDecoration.modifiedResourceForeground": c("diff-modified"),
      "gitDecoration.deletedResourceForeground": c("diff-removed"),
      "gitDecoration.untrackedResourceForeground": c("info"),
      "gitDecoration.ignoredResourceForeground": c("ignored"),
      "gitDecoration.conflictingResourceForeground": c("diff-conflict"),

      "terminal.background": c("canvas"),
      "terminal.foreground": c("fg"),
      "terminal.selectionBackground": c("selection"),
      "terminalCursor.foreground": c("caret"),
      "terminalCursor.background": c("caret-text"),
      "terminal.ansiBlack": p.ansi("black"),
      "terminal.ansiRed": p.ansi("red"),
      "terminal.ansiGreen": p.ansi("green"),
      "terminal.ansiYellow": p.ansi("yellow"),
      "terminal.ansiBlue": p.ansi("blue"),
      "terminal.ansiMagenta": p.ansi("magenta"),
      "terminal.ansiCyan": p.ansi("cyan"),
      "terminal.ansiWhite": p.ansi("white"),
      "terminal.ansiBrightBlack": p.ansi("bright-black"),
      "terminal.ansiBrightRed": p.ansi("bright-red"),
      "terminal.ansiBrightGreen": p.ansi("bright-green"),
      "terminal.ansiBrightYellow": p.ansi("bright-yellow"),
      "terminal.ansiBrightBlue": p.ansi("bright-blue"),
      "terminal.ansiBrightMagenta": p.ansi("bright-magenta"),
      "terminal.ansiBrightCyan": p.ansi("bright-cyan"),
      "terminal.ansiBrightWhite": p.ansi("bright-white"),
      "terminalCommandDecoration.defaultBackground": c("info"),
      "terminalCommandDecoration.successBackground": c("success"),
      "terminalCommandDecoration.errorBackground": c("error"),

      // bracket nesting is a depth, so it gets the ordinal ladder, not six hues
      ...spread("editorBracketHighlight.foreground", BRACKET),
      "editorBracketHighlight.unexpectedBracket.foreground": c("error"),
      ...spread("editorBracketPairGuide.background", Array(6).fill("indent-guide")),
      ...spread("editorBracketPairGuide.activeBackground", BRACKET),

      // outline and suggest icons echo the syntax ladder rather than inventing a palette
      ...Object.fromEntries(
        Object.entries(SYMBOL_ICONS).map(([k, role]) => [`symbolIcon.${k}Foreground`, c(role)])
      ),

      // charts: six ordinal slots, same reasoning as ANSI. The data sweep is
      // sequential-only and these are categorical, so it stays out.
      "charts.foreground": c("fg"),
      "charts.lines": c("border-strong"),
      "charts.red": c("depth-1"),
      "charts.orange": c("depth-2"),
      "charts.yellow": c("depth-3"),
      "charts.green": c("depth-4"),
      "charts.blue": c("depth-5"),
      "charts.purple": c("depth-6"),
      "chart.line": c("depth-1"),
      "chart.axis": c("border-strong"),
      "chart.guide": c("indent-guide"),

      "merge.currentHeaderBackground": c("diff-added-bg"),
      "merge.currentContentBackground": c("diff-added-bg"),
      "merge.incomingHeaderBackground": c("diff-removed-bg"),
      "merge.incomingContentBackground": c("diff-removed-bg"),
      "merge.commonHeaderBackground": c("diff-modified-bg"),
      "merge.commonContentBackground": c("diff-modified-bg"),
      "merge.border": c("border-strong"),

      "editorOverviewRuler.findMatchForeground": c("search-match-current"),
      "editorOverviewRuler.rangeHighlightForeground": c("selection-inactive"),
      "editorOverviewRuler.selectionHighlightForeground": c("selection-inactive"),
      "editorOverviewRuler.wordHighlightForeground": c("selection-inactive"),
      "editorOverviewRuler.wordHighlightStrongForeground": c("selection"),
      "editorOverviewRuler.wordHighlightTextForeground": c("selection-inactive"),
      "editorOverviewRuler.modifiedForeground": c("diff-modified"),
      "editorOverviewRuler.addedForeground": c("diff-added"),
      "editorOverviewRuler.deletedForeground": c("diff-removed"),
      "editorOverviewRuler.errorForeground": c("error"),
      "editorOverviewRuler.warningForeground": c("warning"),
      "editorOverviewRuler.infoForeground": c("info"),
      "editorOverviewRuler.bracketMatchForeground": c("accent-line"),
      "editorOverviewRuler.currentContentForeground": c("diff-added"),
      "editorOverviewRuler.incomingContentForeground": c("diff-removed"),
      "editorOverviewRuler.commonContentForeground": c("diff-modified"),

      "minimap.findMatchHighlight": c("search-match-current"),
      "minimap.selectionHighlight": c("selection"),
      "minimap.errorHighlight": c("error"),
      "minimap.warningHighlight": c("warning"),
      "minimapGutter.addedBackground": c("diff-added"),
      "minimapGutter.modifiedBackground": c("diff-modified"),
      "minimapGutter.deletedBackground": c("diff-removed"),

      "debugTokenExpression.name": c("syn-property"),
      "debugTokenExpression.value": c("syn-fg"),
      "debugTokenExpression.string": c("syn-string"),
      "debugTokenExpression.boolean": c("syn-constant"),
      "debugTokenExpression.number": c("syn-number"),
      "debugTokenExpression.error": c("error"),
      "debugTokenExpression.type": c("syn-type"),

      "testing.iconFailed": c("error"),
      "testing.iconErrored": c("error"),
      "testing.iconPassed": c("success"),
      "testing.iconQueued": c("info"),
      "testing.iconSkipped": c("ignored"),
      "testing.iconUnset": c("fg-disabled"),
      "problemsErrorIcon.foreground": c("error"),
      "problemsWarningIcon.foreground": c("warning"),
      "problemsInfoIcon.foreground": c("info"),

      "notebook.editorBackground": c("canvas"),
      "notebook.cellBorderColor": c("border"),
      "notebook.cellHoverBackground": c("line-highlight"),
      "notebook.cellEditorBackground": c("canvas-sunken"),
      "notebook.focusedCellBackground": c("line-highlight"),
      "notebook.focusedCellBorder": c("accent-line"),
      "notebook.focusedEditorBorder": c("accent-line"),
      "notebook.selectedCellBackground": c("selection-inactive"),
      "notebook.selectedCellBorder": c("border-strong"),
      "notebook.inactiveFocusedCellBorder": c("border-strong"),
      "notebook.inactiveSelectedCellBorder": c("border"),
      "notebook.outputContainerBackgroundColor": c("canvas-sunken"),
      "notebook.outputContainerBorderColor": c("border"),
      "notebook.symbolHighlightBackground": c("search-match"),
      "notebook.cellInsertionIndicator": c("accent-line"),
      "notebook.cellToolbarSeparator": c("border"),
      "notebookStatusSuccessIcon.foreground": c("success"),
      "notebookStatusErrorIcon.foreground": c("error"),
      "notebookStatusRunningIcon.foreground": c("info"),
      "notebookEditorOverviewRuler.runningCellForeground": c("info"),

      "peekViewTitle.background": c("canvas-panel"),
      "peekViewTitleLabel.foreground": c("fg"),
      "peekViewTitleDescription.foreground": c("fg-muted"),
      "peekViewEditorGutter.background": c("canvas-sunken"),
      "peekViewEditor.matchHighlightBackground": c("search-match-current"),
      "peekViewResult.fileForeground": c("fg"),
      "peekViewResult.lineForeground": c("fg-muted"),
      "peekViewResult.matchHighlightBackground": c("search-match"),
      "peekViewResult.selectionBackground": c("accent-surface"),
      "peekViewResult.selectionForeground": c("fg"),

      "editorSuggestWidget.selectedForeground": c("fg"),
      "editorSuggestWidget.selectedIconForeground": c("accent"),
      "editorSuggestWidget.focusHighlightForeground": c("accent"),
      "editorSuggestWidgetStatus.foreground": c("fg-muted"),
      "editorUnnecessaryCode.border": c("border"),
      "editorUnnecessaryCode.opacity": c("ignored"),
      "editorInlayHint.typeForeground": c("hint"),
      "editorInlayHint.typeBackground": c("line-highlight"),
      "editorInlayHint.parameterForeground": c("hint"),
      "editorInlayHint.parameterBackground": c("line-highlight"),

      "editorGutter.modifiedSecondaryBackground": c("diff-modified-bg"),
      "editorGutter.addedSecondaryBackground": c("diff-added-bg"),
      "editorGutter.deletedSecondaryBackground": c("diff-removed-bg"),
      "editorGutter.foldingControlForeground": c("fg-muted"),
      "editorGutter.commentRangeForeground": c("fg-faint"),
      "editorGutter.commentGlyphForeground": c("fg-muted"),
      "editorGutter.commentUnresolvedGlyphForeground": c("accent"),

      "gitDecoration.renamedResourceForeground": c("diff-modified"),
      "gitDecoration.stageModifiedResourceForeground": c("diff-modified"),
      "gitDecoration.stageDeletedResourceForeground": c("diff-removed"),
      "gitDecoration.submoduleResourceForeground": c("info")
    },
    semanticTokenColors,
    tokenColors: TM_SCOPES.map(([name, scope, role]) => ({ name, scope, settings: settings(role) }))
  };
}

function writeVscode(dir, T, L, D) {
  const slug = T.meta.name.toLowerCase();
  mkdirSync(new URL("themes/", dir), { recursive: true });
  const pkg = {
    name: slug,
    displayName: T.meta.name,
    description: T.meta.description,
    version: T.meta.version,
    publisher: slug,
    engines: { vscode: "^1.70.0" },
    categories: ["Themes"],
    contributes: {
      themes: [
        { label: `${T.meta.name} Light`, uiTheme: "vs", path: `./themes/${slug}-light-color-theme.json` },
        { label: `${T.meta.name} Dark`, uiTheme: "vs-dark", path: `./themes/${slug}-dark-color-theme.json` }
      ]
    }
  };
  writeFileSync(new URL("package.json", dir), JSON.stringify(pkg, null, 2) + "\n");
  writeFileSync(new URL(`themes/${slug}-light-color-theme.json`, dir),
    JSON.stringify(vscodeTheme(`${T.meta.name} Light`, L), null, 2) + "\n");
  writeFileSync(new URL(`themes/${slug}-dark-color-theme.json`, dir),
    JSON.stringify(vscodeTheme(`${T.meta.name} Dark`, D), null, 2) + "\n");
  return ["vscode/package.json", `vscode/themes/${slug}-light-color-theme.json`, `vscode/themes/${slug}-dark-color-theme.json`];
}

// --- Obsidian ------------------------------------------------------------
// --color-base-00 is always the background end, --color-base-100 the text end,
// so the ramp simply runs in opposite directions per mode.
// Obsidian's fourteen callout types are a severity scale wearing fourteen hats.
const OB_CALLOUTS = [
  ["error", "error"], ["bug", "error"], ["fail", "error"],
  ["warning", "warning"], ["important", "warning"],
  ["success", "success"], ["tip", "success"], ["todo", "success"],
  ["info", "info"], ["question", "info"], ["summary", "info"],
  ["example", "fg-muted"], ["quote", "syn-quote"], ["default", "fg-muted"]
];

// Pairs, not an object: "10" is an integer-like key and would be hoisted above "00".
const OB_BASE = {
  light: [["00", "000"], ["05", "050"], ["10", "100"], ["20", "200"], ["25", "200"], ["30", "300"],
          ["35", "400"], ["40", "400"], ["50", "500"], ["60", "600"], ["70", "700"], ["100", "950"]],
  dark: [["00", "1000"], ["05", "950"], ["10", "950"], ["20", "900"], ["25", "900"], ["30", "800"],
         ["35", "800"], ["40", "700"], ["50", "600"], ["60", "500"], ["70", "400"], ["100", "100"]]
};

function obsidianBlock(T, p, greyHex) {
  const c = (k) => p.css(k);
  const L = [];
  const put = (k, v) => L.push(`  ${k}: ${v};`);
  const hsl = toHsl(parseColor(p.css("accent")));

  L.push("  /* base ramp: 00 is the background end, 100 the text end */");
  for (const [k, step] of OB_BASE[p.mode]) put(`--color-base-${k}`, greyHex[step]);
  L.push("");
  L.push("  /* accent, decomposed the way Obsidian wants it */");
  put("--accent-h", hsl.h);
  put("--accent-s", `${hsl.s}%`);
  put("--accent-l", `${hsl.l}%`);
  L.push("");
  L.push("  /* named hues collapse onto the grey ramp: severity is weight, not colour */");
  put("--color-red", c("error"));
  put("--color-orange", c("warning"));
  put("--color-yellow", c("warning"));
  put("--color-green", c("success"));
  put("--color-cyan", c("info"));
  put("--color-blue", c("info"));
  put("--color-purple", c("fg-muted"));
  put("--color-pink", c("fg-muted"));
  L.push("");
  L.push("  /* surfaces */");
  put("--background-primary", c("canvas"));
  put("--background-primary-alt", c("canvas-sunken"));
  put("--background-secondary", c("canvas-panel"));
  put("--background-secondary-alt", c("canvas-panel"));
  put("--background-modifier-hover", c("line-highlight"));
  put("--background-modifier-active-hover", c("selection-inactive"));
  put("--background-modifier-border", c("border"));
  put("--background-modifier-border-hover", c("border-strong"));
  put("--background-modifier-border-focus", c("accent-line"));
  put("--background-modifier-error", c("diff-removed-bg"));
  put("--background-modifier-error-hover", c("selection-inactive"));
  put("--background-modifier-success", c("diff-added-bg"));
  put("--background-modifier-message", c("canvas-raised"));
  put("--background-modifier-form-field", c("canvas"));
  L.push("");
  L.push("  /* interaction: the only place the accent is allowed */");
  put("--interactive-normal", c("canvas-panel"));
  put("--interactive-hover", c("line-highlight"));
  put("--interactive-accent", c("accent"));
  put("--interactive-accent-hover", c("link-hover"));
  put("--caret-color", c("caret"));
  put("--text-selection", c("selection"));
  put("--text-highlight-bg", c("search-match"));
  L.push("");
  L.push("  /* text */");
  put("--text-normal", c("fg"));
  put("--text-muted", c("fg-muted"));
  put("--text-faint", c("fg-faint"));
  put("--text-on-accent", c("fg-on-fill"));
  put("--text-on-accent-inverted", c("fg"));
  put("--text-accent", c("link"));
  put("--text-accent-hover", c("link-hover"));
  put("--text-error", c("error"));
  put("--text-warning", c("warning"));
  put("--text-success", c("success"));
  L.push("");
  L.push("  /* heading level is a depth, so it reads the ordinal ladder monotonically */");
  DEPTH.forEach((role, i) => put(`--h${i + 1}-color`, c(role)));
  [700, 700, 600, 600, 600, 600].forEach((w, i) => put(`--h${i + 1}-weight`, w));
  put("--heading-formatting", c("fg-disabled"));
  L.push("");
  L.push("  /* callouts: fourteen named types collapse onto four severities, per rule 2.");
  L.push("     Obsidian wants a bare RGB triplet here, not a colour function. */");
  for (const [k, role] of OB_CALLOUTS) put(`--callout-${k}`, p.rgb(role));
  L.push("");
  L.push("  /* graph: node type is categorical, and the sweep is sequential only,");
  L.push("     so nodes stay on the ramp. Only the focused node is interaction. */");
  put("--graph-text", c("fg"));
  put("--graph-line", c("indent-guide"));
  put("--graph-node", c("fg-muted"));
  put("--graph-node-unresolved", c("fg-disabled"));
  put("--graph-node-focused", c("accent"));
  put("--graph-node-tag", c("fg-faint"));
  put("--graph-node-attachment", c("ignored"));
  L.push("");
  L.push("  /* code: achromatic, category carried by luminance and slope */");
  put("--code-background", c("canvas-sunken"));
  put("--code-normal", c("syn-fg"));
  put("--code-comment", c("syn-comment"));
  put("--code-function", c("syn-function"));
  put("--code-important", c("syn-invalid"));
  put("--code-keyword", c("syn-keyword"));
  put("--code-operator", c("syn-operator"));
  put("--code-property", c("syn-property"));
  put("--code-punctuation", c("syn-punct"));
  put("--code-string", c("syn-string"));
  put("--code-tag", c("syn-tag"));
  put("--code-value", c("syn-number"));
  return L.join("\n");
}

function writeObsidian(dir, T, L, D, greyHex) {
  writeFileSync(new URL("manifest.json", dir), JSON.stringify({
    name: T.meta.name,
    version: T.meta.version,
    minAppVersion: "1.0.0",
    author: T.meta.author
  }, null, 2) + "\n");

  const out = [
    `/* ${T.meta.name} v${T.meta.version} for Obsidian`,
    `   ${T.meta.description}`,
    ...T.meta.rules.map((r) => `   - ${r}`),
    `   Generated from tokens.json. Do not edit by hand. */`,
    "",
    ".theme-light {",
    obsidianBlock(T, L, greyHex),
    "}",
    "",
    ".theme-dark {",
    obsidianBlock(T, D, greyHex),
    "}",
    "",
    "/* slope and weight do the work hue is not allowed to do */",
    ".cm-s-obsidian .cm-comment, .markdown-rendered code .token.comment { font-style: italic; }",
    ".cm-s-obsidian .cm-keyword, .markdown-rendered code .token.keyword { font-weight: 600; }",
    ".markdown-rendered code .token.class-name { font-style: italic; }",
    ""
  ].join("\n");
  writeFileSync(new URL("theme.css", dir), out);
  return ["obsidian/manifest.json", "obsidian/theme.css"];
}

// --- Logseq --------------------------------------------------------------
function logseqBlock(p) {
  const c = (k) => p.css(k);
  const L = [];
  const put = (k, v) => L.push(`  ${k}: ${v};`);

  L.push("  /* surfaces */");
  put("--ls-primary-background-color", c("canvas"));
  put("--ls-secondary-background-color", c("canvas-panel"));
  put("--ls-tertiary-background-color", c("canvas-sunken"));
  put("--ls-quaternary-background-color", c("canvas-raised"));
  put("--ls-slide-background-color", c("canvas"));
  put("--ls-search-background-color", c("canvas-raised"));
  put("--ls-header-button-background", c("canvas-panel"));
  put("--ls-left-sidebar-active-background", c("accent-surface"));
  put("--ls-right-sidebar-code-bg-color", c("canvas-sunken"));
  put("--ls-block-properties-background-color", c("canvas-sunken"));
  put("--ls-page-properties-background-color", c("canvas-sunken"));
  put("--ls-table-tr-even-background-color", c("canvas-sunken"));
  L.push("");
  L.push("  /* structure */");
  put("--ls-border-color", c("border"));
  put("--ls-secondary-border-color", c("border-strong"));
  put("--ls-tertiary-border-color", c("indent-guide"));
  put("--ls-guideline-color", c("indent-guide"));
  put("--ls-focus-ring-color", c("border-focus"));
  L.push("");
  L.push("  /* text */");
  put("--ls-primary-text-color", c("fg"));
  put("--ls-secondary-text-color", c("fg-muted"));
  put("--ls-title-text-color", c("fg"));
  put("--ls-head-text-color", c("fg"));
  put("--ls-icon-color", c("fg-muted"));
  put("--ls-search-icon-color", c("fg-faint"));
  put("--ls-cloze-text-color", c("fg"));
  L.push("");
  L.push("  /* interaction: the only place the accent is allowed */");
  put("--ls-active-primary-color", c("accent"));
  put("--ls-active-secondary-color", c("link-hover"));
  put("--ls-link-text-color", c("link"));
  put("--ls-link-text-hover-color", c("link-hover"));
  put("--ls-link-ref-text-color", c("link"));
  put("--ls-link-ref-text-hover-color", c("link-hover"));
  put("--ls-block-ref-link-text-color", c("link"));
  put("--ls-tag-text-color", c("fg-muted"));
  put("--ls-tag-text-hover-color", c("link-hover"));
  put("--ls-menu-hover-color", c("line-highlight"));
  put("--ls-a-chosen-bg", c("accent-surface"));
  put("--ls-selection-background-color", c("selection"));
  put("--ls-selection-text-color", c("selection-text"));
  put("--ls-block-highlight-color", c("selection-inactive"));
  L.push("");
  L.push("  /* blocks */");
  put("--ls-block-bullet-color", c("fg-faint"));
  put("--ls-block-bullet-border-color", c("border-strong"));
  put("--ls-page-checkbox-color", c("fg-muted"));
  put("--ls-page-checkbox-border-color", c("border-strong"));
  put("--ls-page-blockquote-color", c("syn-quote"));
  put("--ls-page-blockquote-bg-color", c("line-highlight"));
  put("--ls-page-blockquote-border-color", c("accent-line"));
  put("--ls-page-inline-code-color", c("syn-literal"));
  put("--ls-page-inline-code-bg-color", c("canvas-sunken"));
  put("--ls-page-mark-color", c("fg"));
  L.push("");
  L.push("  /* scrollbar */");
  put("--ls-scrollbar-foreground-color", c("scrollbar"));
  put("--ls-scrollbar-background-color", c("canvas-panel"));
  put("--ls-scrollbar-thumb-hover-color", c("scrollbar-hover"));
  L.push("");
  L.push("  /* status stays achromatic: density, not hue */");
  put("--ls-error-color", c("error"));
  put("--ls-error-text-color", c("error"));
  put("--ls-error-background-color", c("diff-removed-bg"));
  put("--ls-warning-color", c("warning"));
  put("--ls-warning-text-color", c("warning"));
  put("--ls-warning-background-color", c("diff-modified-bg"));
  put("--ls-success-color", c("success"));
  put("--ls-success-text-color", c("success"));
  put("--ls-success-background-color", c("diff-added-bg"));
  put("--ls-color-file-sync-error", c("error"));
  put("--ls-color-file-sync-pending", c("warning"));
  put("--ls-color-file-sync-idle", c("success"));
  put("--ls-pie-fg-color", c("fg-muted"));
  put("--ls-pie-bg-color", c("canvas-sunken"));
  L.push("");
  L.push("  /* block highlights: seven named hues collapse onto four densities */");
  put("--ls-highlight-color-gray", c("diff-added-bg"));
  put("--ls-highlight-color-blue", c("diff-modified-bg"));
  put("--ls-highlight-color-green", c("diff-modified-bg"));
  put("--ls-highlight-color-yellow", c("diff-removed-bg"));
  put("--ls-highlight-color-purple", c("diff-removed-bg"));
  put("--ls-highlight-color-red", c("selection-inactive"));
  put("--ls-highlight-color-pink", c("selection-inactive"));
  return L.join("\n");
}

const CM_TOKENS = [
  ["keyword", "syn-keyword"], ["atom", "syn-constant"], ["number", "syn-number"],
  ["def", "syn-function"], ["variable", "syn-variable"], ["variable-2", "syn-property"],
  ["variable-3", "syn-type"], ["property", "syn-property"], ["operator", "syn-operator"],
  ["comment", "syn-comment"], ["string", "syn-string"], ["string-2", "syn-string-escape"],
  ["meta", "syn-preproc"], ["qualifier", "syn-namespace"], ["builtin", "syn-constant"],
  ["bracket", "syn-punct"], ["tag", "syn-tag"], ["attribute", "syn-attribute"],
  ["type", "syn-type"], ["punctuation", "syn-punct"], ["link", "syn-link-uri"],
  ["error", "syn-invalid"]
];

function writeLogseq(dir, T, L, D) {
  const cm = (p, sel) => {
    const out = [`${sel} { color: ${p.css("syn-fg")}; background: ${p.css("canvas-sunken")}; }`];
    for (const [tok, role] of CM_TOKENS) {
      const st = p.style(role);
      const extra = st === "bold" ? " font-weight: 600;" : st === "italic" ? " font-style: italic;" : "";
      out.push(`${sel} .cm-${tok} { color: ${p.css(role)};${extra} }`);
    }
    out.push(`${sel} .CodeMirror-cursor { border-left-color: ${p.css("caret")}; }`);
    out.push(`${sel} .CodeMirror-selected { background: ${p.css("selection")}; }`);
    out.push(`${sel} .CodeMirror-linenumber { color: ${p.css("fg-disabled")}; }`);
    return out.join("\n");
  };

  const out = [
    `/* ${T.meta.name} v${T.meta.version} for Logseq`,
    `   ${T.meta.description}`,
    ...T.meta.rules.map((r) => `   - ${r}`),
    `   Generated from tokens.json. Do not edit by hand.`,
    `   Drop into <graph>/logseq/custom.css, or @import it from there. */`,
    "",
    "html[data-theme=light] {",
    logseqBlock(L),
    "}",
    "",
    "html[data-theme=dark] {",
    logseqBlock(D),
    "}",
    "",
    "/* code blocks are CodeMirror 5; slope and weight carry what hue cannot */",
    cm(L, "html[data-theme=light] .CodeMirror"),
    "",
    cm(D, "html[data-theme=dark] .CodeMirror"),
    ""
  ].join("\n");
  writeFileSync(new URL("custom.css", dir), out);
  return ["logseq/custom.css"];
}

// --- Ghostty -------------------------------------------------------------
const ANSI_ORDER = [
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "bright-black", "bright-red", "bright-green", "bright-yellow",
  "bright-blue", "bright-magenta", "bright-cyan", "bright-white"
];

function writeGhostty(dir, T, L, D) {
  const one = (p, label) => {
    const out = [
      `# ${T.meta.name} ${label} v${T.meta.version}`,
      `# ${T.meta.description}`,
      `# Achromatic ANSI: the six hue slots are a luminance ladder, loudest first.`,
      `# Generated from tokens.json. Do not edit by hand.`,
      "",
      `background = ${p.hex("canvas")}`,
      `foreground = ${p.hex("fg")}`,
      `cursor-color = ${p.hex("caret")}`,
      `cursor-text = ${p.hex("caret-text")}`,
      `selection-background = ${p.flat("selection")}`,
      `selection-foreground = ${p.hex("selection-text")}`,
      `search-background = ${p.flat("search-match")}`,
      `search-foreground = ${p.hex("fg")}`,
      `search-selected-background = ${p.flat("search-match-current")}`,
      `search-selected-foreground = ${p.hex("fg")}`,
      `split-divider-color = ${p.hex("border")}`,
      `unfocused-split-fill = ${p.hex("canvas-panel")}`,
      "",
      "# The bright hues repeat their normal counterparts, so promoting bold to",
      "# bright would erase the weight distinction and buy nothing back.",
      "bold-is-bright = false",
      ""
    ];
    ANSI_ORDER.forEach((k, i) => out.push(`palette = ${i}=${p.ansi(k)}`));
    out.push("");
    return out.join("\n");
  };
  const slug = T.meta.name.toLowerCase();
  writeFileSync(new URL(`${slug}-light`, dir), one(L, "Light"));
  writeFileSync(new URL(`${slug}-dark`, dir), one(D, "Dark"));
  return [`ghostty/${slug}-light`, `ghostty/${slug}-dark`];
}

// --- Firefox and Thunderbird ---------------------------------------------
// Both consume the WebExtension theme manifest key. Names verified against MDN's
// theme manifest reference and Thunderbird's ThemeType; the two sets differ only
// at the tail, so the shared map is built once and trimmed per host.
//
// The selected tab must read as continuous with the toolbar, so tab_selected and
// toolbar share a value and the frame sits one step behind them.
function geckoColors(p) {
  const c = (k) => p.hex(k);
  return {
    frame: c("canvas-sunken"),
    frame_inactive: c("canvas-sunken"),
    toolbar: c("canvas-panel"),
    tab_selected: c("canvas-panel"),
    tab_text: c("fg"),
    tab_background_text: c("fg-muted"),
    tab_background_separator: c("border"),
    // accent, not accent-line: the frame is a step off the canvas, and accent-500
    // drops under 3:1 against it. This line marks the current tab, so it is accent
    // in the rule-1 sense anyway.
    tab_line: c("accent"),
    tab_loading: c("accent"),

    toolbar_text: c("fg"),
    bookmark_text: c("fg"),
    toolbar_top_separator: c("border"),
    toolbar_bottom_separator: c("border"),
    toolbar_vertical_separator: c("border"),
    toolbar_field_separator: c("border"),

    toolbar_field: c("canvas"),
    toolbar_field_text: c("fg"),
    toolbar_field_border: c("border-strong"),
    toolbar_field_focus: c("canvas"),
    toolbar_field_text_focus: c("fg"),
    // Focus stays achromatic on purpose. The accent says which item is current;
    // focus says where the keyboard is, and must survive on every surface.
    toolbar_field_border_focus: c("border-focus"),
    toolbar_field_highlight: p.flatOn("selection", "canvas"),
    toolbar_field_highlight_text: c("selection-text"),

    popup: c("canvas-raised"),
    popup_text: c("fg"),
    // border-strong, not border: in dark, canvas-raised and border are both
    // grey-900, which would leave the popup with no visible edge.
    popup_border: c("border-strong"),
    popup_highlight: p.flatOn("accent-surface", "canvas-raised"),
    popup_highlight_text: c("fg"),

    sidebar: c("canvas-panel"),
    sidebar_text: c("fg"),
    sidebar_border: c("border"),
    sidebar_highlight: c("accent"),
    sidebar_highlight_text: c("fg-on-fill"),

    icons: c("fg-muted"),
    icons_attention: c("accent"),
    button_background_hover: p.flatOn("line-highlight", "canvas-panel"),
    button_background_active: p.flatOn("selection-inactive", "canvas-panel")
  };
}

const geckoBlock = (p) => ({
  colors: geckoColors(p),
  properties: { color_scheme: p.mode, content_color_scheme: "auto" }
});

function writeFirefox(dir, T, L, D) {
  const slug = T.meta.name.toLowerCase();
  const light = geckoBlock(L), dark = geckoBlock(D);
  // ntp_* is Firefox-only; Thunderbird has no new tab page.
  Object.assign(light.colors, { ntp_background: L.hex("canvas"), ntp_text: L.hex("fg"), ntp_card_background: L.hex("canvas-panel") });
  Object.assign(dark.colors, { ntp_background: D.hex("canvas"), ntp_text: D.hex("fg"), ntp_card_background: D.hex("canvas-panel") });

  const manifest = JSON.stringify({
    manifest_version: 2,
    name: T.meta.name,
    version: T.meta.version,
    description: T.meta.description,
    author: T.meta.author,
    browser_specific_settings: { gecko: { id: `${slug}@${slug}.theme` } },
    theme: light,
    dark_theme: dark
  }, null, 2) + "\n";

  writeFileSync(new URL("manifest.json", dir), manifest);
  writeFileSync(new URL(`${slug}.xpi`, dir), zip([{ name: "manifest.json", data: manifest }]));
  return ["firefox/manifest.json", `firefox/${slug}.xpi`];
}

function writeThunderbird(dir, T, L, D) {
  const slug = T.meta.name.toLowerCase();
  // Thunderbird requires an explicit add-on id and does not document dark_theme,
  // so each mode ships as its own complete static theme.
  const one = (p, label) => {
    const block = geckoBlock(p);
    block.colors.sidebar_highlight_border = p.hex("accent-line"); // Thunderbird-only
    delete block.colors.tab_loading; // no page loading in a mail client
    const sub = new URL(`${slug}-${p.mode}/`, dir);
    mkdirSync(sub, { recursive: true });
    const manifest = JSON.stringify({
      manifest_version: 2,
      name: `${T.meta.name} ${label}`,
      version: T.meta.version,
      description: T.meta.description,
      author: T.meta.author,
      browser_specific_settings: {
        gecko: { id: `${slug}-${p.mode}@${slug}.theme`, strict_min_version: "115.0" }
      },
      theme: block
    }, null, 2) + "\n";

    writeFileSync(new URL("manifest.json", sub), manifest);
    writeFileSync(new URL(`${slug}-${p.mode}.xpi`, dir),
      zip([{ name: "manifest.json", data: manifest }]));
    return [
      `thunderbird/${slug}-${p.mode}/manifest.json`,
      `thunderbird/${slug}-${p.mode}.xpi`
    ];
  };
  return [...one(L, "Light"), ...one(D, "Dark")];
}

// --- specimen ------------------------------------------------------------
// A syntax theme cannot be judged from a table of hexes. This renders the real
// thing: the same sample on both canvases, plus the ladders it is built from.
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const K = "syn-keyword", FN = "syn-function", TY = "syn-type", ST = "syn-string",
  NU = "syn-number", CM = "syn-comment", DC = "syn-doc", PU = "syn-punct",
  OP = "syn-operator", VA = "syn-variable", PM = "syn-parameter", PR = "syn-property",
  CN = "syn-constant", EC = "syn-string-escape", FG = "syn-fg";

const SAMPLE = [
  [[DC, "/** Resolve {alias} chains against the parsed token tree. */"]],
  [[K, "export"], [FG, " "], [K, "function"], [FG, " "], [FN, "resolve"], [PU, "("], [PM, "value"], [PU, ":"], [FG, " "], [TY, "string"], [PU, ","], [FG, " "], [PM, "depth"], [FG, " "], [OP, "="], [FG, " "], [NU, "0"], [PU, "):"], [FG, " "], [TY, "string"], [FG, " "], [PU, "{"]],
  [[CM, "  // cycle guard: twelve hops is deeper than any real alias"]],
  [[FG, "  "], [K, "if"], [FG, " "], [PU, "("], [VA, "depth"], [FG, " "], [OP, ">"], [FG, " "], [NU, "12"], [PU, ")"], [FG, " "], [K, "throw"], [FG, " "], [K, "new"], [FG, " "], [FN, "Error"], [PU, "("], [ST, "`Alias cycle near: "], [EC, "${"], [VA, "value"], [EC, "}"], [ST, "`"], [PU, ");"]],
  [],
  [[FG, "  "], [K, "const"], [FG, " "], [VA, "out"], [FG, " "], [OP, "="], [FG, " "], [VA, "value"], [PU, "."], [FN, "replace"], [PU, "("], [EC, "/\\{([^}]+)\\}/g"], [PU, ","], [FG, " "], [PU, "("], [PM, "_"], [PU, ","], [FG, " "], [PM, "path"], [PU, ")"], [FG, " "], [OP, "=>"], [FG, " "], [PU, "{"]],
  [[FG, "    "], [K, "let"], [FG, " "], [VA, "node"], [FG, " "], [OP, "="], [FG, " "], [FN, "at"], [PU, "("], [VA, "path"], [PU, "."], [FN, "trim"], [PU, "());"]],
  [[FG, "    "], [K, "if"], [FG, " "], [PU, "("], [VA, "node"], [FG, " "], [OP, "=="], [FG, " "], [CN, "null"], [PU, ")"], [FG, " "], [K, "throw"], [FG, " "], [K, "new"], [FG, " "], [FN, "Error"], [PU, "("], [ST, '"Unknown token: "'], [FG, " "], [OP, "+"], [FG, " "], [VA, "path"], [PU, ");"]],
  [[FG, "    "], [K, "return"], [FG, " "], [K, "typeof"], [FG, " "], [VA, "node"], [FG, " "], [OP, "==="], [FG, " "], [ST, '"object"'], [FG, " "], [OP, "?"], [FG, " "], [VA, "node"], [PU, "."], [PR, "hex"], [FG, " "], [OP, ":"], [FG, " "], [VA, "node"], [PU, ";"]],
  [[FG, "  "], [PU, "});"]],
  [],
  [[FG, "  "], [K, "return"], [FG, " "], [VA, "out"], [FG, " "], [OP, "==="], [FG, " "], [VA, "value"], [FG, " "], [OP, "?"], [FG, " "], [VA, "out"], [FG, " "], [OP, ":"], [FG, " "], [FN, "resolve"], [PU, "("], [VA, "out"], [PU, ","], [FG, " "], [VA, "depth"], [FG, " "], [OP, "+"], [FG, " "], [NU, "1"], [PU, ");"]],
  [[PU, "}"]]
];

const HIGHLIT = 3; // the line that carries the active-line wash and caret

function styleAttr(p, role) {
  const st = p.style(role);
  return `color:${p.css(role)}` +
    (st === "italic" ? ";font-style:italic" : "") +
    (st === "bold" ? ";font-weight:700" : "") +
    (st === "underline" ? ";text-decoration:underline" : "");
}

function codePane(p, label, ratio) {
  const rows = SAMPLE.map((line, i) => {
    const n = String(i + 1).padStart(2, " ");
    const active = i === HIGHLIT;
    const spans = line.map(([role, text]) =>
      `<span style="${styleAttr(p, role)}">${esc(text)}</span>`).join("") ||
      "<span> </span>";
    const caret = active ? `<i class="caret" style="background:${p.css("caret")}"></i>` : "";
    return `<div class="ln${active ? " on" : ""}"` +
      (active ? ` style="background:${p.css("line-highlight")}"` : "") +
      `><span class="gut" style="color:${p.css(active ? "fg" : "fg-disabled")}">${n}</span>` +
      `<code>${spans}${caret}</code></div>`;
  }).join("");

  const sel = `<span style="background:${p.css("selection")};color:${p.css("selection-text")}">selection</span>`;
  return `<figure class="pane">
  <figcaption><b>${label}</b><span>canvas ${p.css("canvas")} &middot; text ${ratio(p.css("syn-fg"), p.css("canvas")).toFixed(1)}:1</span></figcaption>
  <div class="code" style="background:${p.css("canvas")};border-color:${p.css("border")}">${rows}</div>
  <div class="strip" style="background:${p.css("canvas-panel")};color:${p.css("fg-muted")};border-color:${p.css("border")}">
    caret and ${sel} are the only teal in the editor
  </div>
</figure>`;
}

function ladder(p, ratio) {
  const roles = p.roles().filter((r) => r.startsWith("syn-") && p.css(r).startsWith("#"));
  const rows = roles
    .map((r) => [r, p.css(r), ratio(p.css(r), p.css("canvas"))])
    .sort((a, b) => a[2] - b[2])
    .map(([r, hex, c]) => `<tr><td class="sw"><i style="background:${hex}"></i></td>` +
      `<td><span style="${styleAttr(p, r)}">${r.replace("syn-", "")}</span></td>` +
      `<td class="mono">${hex}</td><td class="num">${c.toFixed(2)}</td></tr>`).join("");
  return `<table class="lad"><thead><tr><th></th><th>role</th><th>hex</th><th>vs canvas</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function ansiGrid(p) {
  const seen = {};
  for (const [k, v] of Object.entries(p.allAnsi())) (seen[v] ||= []).push(k);
  const cell = (k) => {
    const v = p.ansi(k);
    const twin = seen[v].filter((x) => x !== k);
    return `<div class="ac"><i style="background:${v};border-color:${p.css("border")}"></i>` +
      `<b>${k}</b><span class="mono">${v}</span>` +
      `<em>${twin.length ? "= " + twin.join(", ") : "&nbsp;"}</em></div>`;
  };
  return `<div class="ansi">${ANSI_ORDER.map(cell).join("")}</div>` +
    `<p class="note">${Object.keys(seen).length} distinct values across 16 slots. Every repeat pairs a hue with its own bright variant, so no two different hues collide.</p>`;
}

function severityStrip(p) {
  const row = (label, fg, bg) =>
    `<div class="sev" style="background:${p.css(bg)};border-left:3px solid ${p.css(fg)}">` +
    `<b style="color:${p.css(fg)}">${label}</b><span style="color:${p.css("fg-muted")}">${p.css(bg)}</span></div>`;
  return `<div class="sevs">
    ${row("added", "diff-added", "diff-added-bg")}
    ${row("modified", "diff-modified", "diff-modified-bg")}
    ${row("removed", "diff-removed", "diff-removed-bg")}
  </div>
  <div class="dots">${["error", "warning", "success", "info", "hint", "ignored"]
      .map((r) => `<span><i style="background:${p.css(r)}"></i>${r}</span>`).join("")}</div>
  <div class="brk" style="background:${p.css("canvas")}">${BRACKET
      .map((r) => `<span style="color:${p.css(r)}">(</span>`).join("") +
    `<span style="color:${p.css("syn-fg")}">depth</span>` +
    [...BRACKET].reverse().map((r) => `<span style="color:${p.css(r)}">)</span>`).join("")}</div>`;
}

function chromeMock(p, label) {
  const k = geckoColors(p);
  const tab = (name, on) => `<span class="tb${on ? " on" : ""}" style="background:${on ? k.tab_selected : "transparent"};` +
    `color:${on ? k.tab_text : k.tab_background_text};${on ? `box-shadow:inset 0 2px 0 ${k.tab_line}` : ""}">${name}</span>`;
  return `<figure class="pane">
  <figcaption><b>${label}</b><span>frame ${k.frame} &middot; toolbar ${k.toolbar}</span></figcaption>
  <div class="chr" style="border-color:${p.css("border")}">
    <div class="chr-frame" style="background:${k.frame}">
      ${tab("tokens.json", true)}${tab("specimen.html", false)}${tab("build.mjs", false)}
    </div>
    <div class="chr-bar" style="background:${k.toolbar};border-top:1px solid ${k.toolbar_top_separator}">
      <i style="background:${k.icons}"></i><i style="background:${k.icons}"></i>
      <span class="chr-url" style="background:${k.toolbar_field};color:${k.toolbar_field_text};border:1px solid ${k.toolbar_field_border_focus}">
        ambergris<span style="background:${k.toolbar_field_highlight};color:${k.toolbar_field_highlight_text}">/themes</span>
      </span>
      <i style="background:${k.icons_attention}"></i>
    </div>
    <div class="chr-body" style="background:${k.sidebar}">
      <span class="chr-sel" style="background:${k.sidebar_highlight};color:${k.sidebar_highlight_text}">current item</span>
      <span style="color:${k.sidebar_text}">sidebar row</span>
      <span style="color:${p.css("fg-muted")}">sidebar row</span>
    </div>
  </div>
  <div class="strip" style="background:${p.css("canvas-panel")};color:${p.css("fg-muted")};border-color:${p.css("border")}">
    tab line, loading, selection and the current row are teal. The focus ring is not.
  </div>
</figure>`;
}

function writeSpecimen(dir, T, L, D, ratio, files) {
  const page = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${T.meta.name} application themes</title>
<style>
  :root { color-scheme: light dark; --pg:${T.color.grey["000"].hex}; --tx:${T.color.grey["950"].hex};
          --mu:${T.color.grey["600"].hex}; --ln:${T.color.grey["200"].hex}; --pn:${T.color.grey["050"].hex}; }
  @media (prefers-color-scheme: dark) {
    :root { --pg:${T.color.grey["1000"].hex}; --tx:${T.color.grey["100"].hex};
            --mu:${T.color.grey["500"].hex}; --ln:${T.color.grey["900"].hex}; --pn:${T.color.grey["950"].hex}; }
  }
  * { box-sizing: border-box; }
  body { margin:0; padding:3rem 1.5rem 6rem; background:var(--pg); color:var(--tx);
         font:15px/1.6 ui-sans-serif,-apple-system,"Segoe UI",sans-serif; }
  .wrap { max-width:1180px; margin:0 auto; }
  h1 { font-size:1.9rem; letter-spacing:-.02em; margin:0 0 .25rem; font-weight:650; }
  h2 { font-size:.78rem; text-transform:uppercase; letter-spacing:.1em; color:var(--mu);
       font-weight:600; margin:3.5rem 0 .4rem; }
  .sub { color:var(--mu); margin:0 0 .6rem; max-width:62ch; }
  ol.rules { color:var(--mu); font-size:.86rem; max-width:70ch; padding-left:1.1rem; margin:0 0 1rem; }
  hr { border:0; border-top:1px solid var(--ln); margin:1.6rem 0 0; }
  .mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
  .panes { display:grid; gap:1.25rem; grid-template-columns:repeat(auto-fit,minmax(430px,1fr)); }
  .pane { margin:0; }
  figcaption { display:flex; justify-content:space-between; align-items:baseline; gap:1rem;
               font-size:.78rem; color:var(--mu); margin-bottom:.45rem; }
  figcaption b { color:var(--tx); font-weight:600; }
  .code { border:1px solid; border-radius:6px 6px 0 0; padding:.85rem 0; overflow-x:auto;
          font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12.5px; line-height:1.65; }
  .ln { display:flex; padding:0 .9rem; white-space:pre; }
  .gut { user-select:none; opacity:.85; padding-right:1.1rem; }
  .caret { display:inline-block; width:2px; height:1.15em; vertical-align:text-bottom;
           margin-left:1px; animation:blink 1.1s step-end infinite; }
  @keyframes blink { 50% { opacity:0; } }
  @media (prefers-reduced-motion: reduce) { .caret { animation:none; } }
  .strip { border:1px solid; border-top:0; border-radius:0 0 6px 6px; padding:.5rem .9rem; font-size:.76rem; }
  .grid2 { display:grid; gap:2rem; grid-template-columns:repeat(auto-fit,minmax(340px,1fr)); }
  table.lad { border-collapse:collapse; width:100%; font-size:12.5px; }
  table.lad th { text-align:left; font-weight:500; color:var(--mu); font-size:.7rem;
                 text-transform:uppercase; letter-spacing:.07em; padding:0 .5rem .35rem; }
  table.lad td { padding:.1rem .5rem; border-top:1px solid var(--ln); }
  table.lad td.mono, table.lad td.num { font-family:ui-monospace,Menlo,monospace; color:var(--mu); }
  table.lad td.num { text-align:right; }
  td.sw { width:1.4rem; } td.sw i { display:block; width:14px; height:14px; border-radius:3px; }
  .ansi { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:.5rem; }
  .ac { font-size:.72rem; line-height:1.45; }
  .ac i { display:block; height:26px; border-radius:4px; border:1px solid; margin-bottom:.3rem; }
  .ac b { display:block; font-weight:600; }
  .ac span { color:var(--mu); } .ac em { display:block; color:var(--mu); font-style:normal; opacity:.75; }
  .note { color:var(--mu); font-size:.8rem; max-width:66ch; }
  .sevs { display:grid; gap:.4rem; margin-bottom:.9rem; }
  .sev { display:flex; justify-content:space-between; padding:.45rem .7rem; font-size:.78rem; }
  .dots { display:flex; flex-wrap:wrap; gap:1rem; font-size:.76rem; color:var(--mu); margin-bottom:.9rem; }
  .dots i { display:inline-block; width:11px; height:11px; border-radius:99px; margin-right:.35rem;
            vertical-align:-1px; }
  .brk { font-family:ui-monospace,Menlo,monospace; padding:.55rem .8rem; border-radius:5px;
         font-size:1.05rem; letter-spacing:.15em; }
  .chr { border:1px solid; border-radius:6px; overflow:hidden; font-size:.75rem; }
  .chr-frame { display:flex; gap:2px; padding:.4rem .4rem 0; }
  .tb { padding:.4rem .8rem; border-radius:5px 5px 0 0; white-space:nowrap; }
  .chr-bar { display:flex; align-items:center; gap:.5rem; padding:.45rem .6rem; }
  .chr-bar i { width:13px; height:13px; border-radius:3px; flex:none; opacity:.75; }
  .chr-url { flex:1; padding:.3rem .55rem; border-radius:99px;
             font-family:ui-monospace,Menlo,monospace; font-size:.72rem; }
  .chr-body { display:flex; flex-direction:column; gap:.15rem; padding:.5rem; }
  .chr-body span { padding:.28rem .5rem; border-radius:4px; }
  .chr-sel { font-weight:600; }
  ul.files { list-style:none; padding:0; columns:2; font-size:.8rem; font-family:ui-monospace,Menlo,monospace; }
  ul.files li { color:var(--mu); margin-bottom:.2rem; break-inside:avoid; }
</style>
<div class="wrap">
  <h1>${T.meta.name} <span style="color:var(--mu);font-weight:400">application themes</span></h1>
  <p class="sub">${esc(T.meta.description)}</p>
  <ol class="rules">${T.meta.rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ol>
  <hr>

  <h2>The same sample, both canvases</h2>
  <p class="sub">Syntax is achromatic. Category is luminance step plus slope and weight. The only
  teal in either pane is the caret and the selection, which are interaction, per rule 1.</p>
  <div class="panes">
    ${codePane(L, "Light", ratio)}
    ${codePane(D, "Dark", ratio)}
  </div>

  <h2>Browser and mail chrome</h2>
  <p class="sub">Firefox and Thunderbird consume the same WebExtension theme keys. The selected tab
  shares its value with the toolbar so the two read as one plane, and the frame sits a step behind.</p>
  <div class="panes">
    ${chromeMock(L, "Light")}
    ${chromeMock(D, "Dark")}
  </div>

  <h2>Syntax ladder, dimmest first</h2>
  <p class="sub">Every value below is a step on the grey ramp. Read down each column to see how much
  separation the theme actually has to work with.</p>
  <div class="grid2"><div>${ladder(L, ratio)}</div><div>${ladder(D, ratio)}</div></div>

  <h2>Severity, depth and diffs</h2>
  <p class="sub">Severity is fill density and border weight, never hue, per rule 2. Bracket nesting
  reads the ordinal ladder in alternating order so adjacent levels separate.</p>
  <div class="grid2"><div>${severityStrip(L)}</div><div>${severityStrip(D)}</div></div>

  <h2>ANSI, light</h2>
  ${ansiGrid(L)}
  <h2>ANSI, dark</h2>
  ${ansiGrid(D)}

  <h2>Generated files</h2>
  <ul class="files">${files.map((f) => `<li>themes/${f}</li>`).join("")}</ul>
</div>
</html>
`;
  writeFileSync(new URL("specimen.html", dir), page);
}

// --- entry ---------------------------------------------------------------
export function emitThemes({ T, resolve, ratio, root }) {
  // A role defined in only one mode would silently inherit the other's value.
  const lk = Object.keys(T.editor.light), dk = Object.keys(T.editor.dark);
  const missing = [
    ...lk.filter((k) => !dk.includes(k)).map((k) => `editor.dark is missing "${k}"`),
    ...dk.filter((k) => !lk.includes(k)).map((k) => `editor.light is missing "${k}"`),
    ...ANSI_ORDER.filter((k) => !(k in T.terminal.light)).map((k) => `terminal.light is missing "${k}"`),
    ...ANSI_ORDER.filter((k) => !(k in T.terminal.dark)).map((k) => `terminal.dark is missing "${k}"`)
  ];
  if (missing.length) {
    console.error("\n" + missing.join("\n") + "\nBuild rejected.");
    process.exit(1);
  }

  const L = palette(T, resolve, "light"), D = palette(T, resolve, "dark");

  // Rule 3, mechanically. The sweep is sequential-only, and every slot these five
  // hosts expose (chart series, graph node type, ANSI) is categorical, so no editor
  // role may resolve to a sweep colour. Prose in a comment does not hold a line.
  const sweep = new Set(
    ["sequence-on-light", "sequence-on-dark"]
      .flatMap((s) => Object.values(T.data[s]).map((v) => v.hex.toLowerCase()))
  );
  const leaks = [];
  for (const p of [L, D])
    for (const [role, value] of Object.entries({ ...p.all(), ...p.allAnsi() }))
      if (sweep.has(value)) leaks.push(`${p.mode}.${role} is a data sweep colour (${value})`);
  if (leaks.length) {
    console.error("\nThe data sweep must not appear in interface chrome:\n  " +
      leaks.join("\n  ") + "\nBuild rejected.");
    process.exit(1);
  }
  const greyHex = Object.fromEntries(
    Object.entries(T.color.grey).map(([k, v]) => [k, v.hex.toLowerCase()])
  );

  const written = [];
  for (const [sub, fn] of [
    ["zed", (d) => writeZed(d, T, L, D)],
    ["vscode", (d) => writeVscode(d, T, L, D)],
    ["obsidian", (d) => writeObsidian(d, T, L, D, greyHex)],
    ["logseq", (d) => writeLogseq(d, T, L, D)],
    ["ghostty", (d) => writeGhostty(d, T, L, D)],
    ["firefox", (d) => writeFirefox(d, T, L, D)],
    ["thunderbird", (d) => writeThunderbird(d, T, L, D)]
  ]) {
    const d = new URL(`./themes/${sub}/`, root);
    mkdirSync(d, { recursive: true });
    written.push(...fn(d));
  }
  writeSpecimen(new URL("./themes/", root), T, L, D, ratio, written);
  return [...written, "specimen.html"];
}
