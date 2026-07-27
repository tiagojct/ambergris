// Ambergris token build. No dependencies. node build.mjs
import { readFileSync, writeFileSync } from "node:fs";

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
