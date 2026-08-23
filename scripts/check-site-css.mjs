// Marketing-site static check: every class used in the HTML must actually have
// a CSS rule behind it, and every internal anchor must resolve.
//
// Why this exists: styles.css at the repo root is a *purged* Tailwind build
// committed as an artifact, and there is no build step here (see CLAUDE.md).
// A utility that isn't in that file does not error — it silently does nothing.
// That failure mode shipped several real defects to production: `md:grid-cols-6`
// (every page footer collapsed to 2 columns on desktop), `bg-paper/96` (mobile
// nav dropdown had no background), `bg-grape/10`, and ~20 spacing/sizing
// utilities on the homepage. All were invisible to tsc, eslint and code review.
//
// Run from the repo root:  node scripts/check-site-css.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// Classes that are JS selectors or third-party hooks, not styling. Absence of a
// CSS rule for these is correct, not a defect.
const NON_STYLE_CLASSES = new Set([
  'counter',         // querySelectorAll('.counter') — animated stat counters
  'hero-email-form', // legacy hook; no rule and no JS reference, harmless
  'reveal',          // scroll-reveal, defined per-page inline
  'js',
]);

const PAGES = ['index.html', 'features.html', 'blog.html', 'privacy.html', 'terms.html']
  .filter((p) => existsSync(join(ROOT, p)));

for (const dir of ['trades', 'alternatives', 'blog']) {
  if (!existsSync(join(ROOT, dir))) continue;
  for (const f of readdirSync(join(ROOT, dir))) {
    if (f.endsWith('.html')) PAGES.push(`${dir}/${f}`);
  }
}

const sharedCss =
  read('styles.css') + (existsSync(join(ROOT, 'features.css')) ? read('features.css') : '');

const inlineStyles = (html) =>
  [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');

const idsOf = (html) => new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));

const classesOf = (html) => {
  const out = new Set();
  for (const m of html.matchAll(/class="([^"]+)"/g))
    m[1].split(/\s+/).filter(Boolean).forEach((c) => out.add(c));
  return out;
};

const rxEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function hasRule(css, cls) {
  if (NON_STYLE_CLASSES.has(cls)) return true;
  // Tailwind escapes these characters when emitting the selector.
  const sel = '.' + cls.replace(/[:\/.[\]()%#,+]/g, (ch) => '\\' + ch);
  // Selector may be followed by `{`, comma, pseudo-class, combinator or space
  // (e.g. `.space-y-3>:not([hidden])~:not([hidden])`).
  if (new RegExp(rxEscape(sel) + '(?=[{,:>~+\\s])').test(css)) return true;
  // Arbitrary values: Tailwind hex-escapes commas (`\2c `) and similar, so the
  // literal selector won't match even when the rule is present. Probe a
  // distinctive slice of the value instead.
  const arb = cls.match(/\[(.+)\]$/);
  if (arb) return new RegExp(rxEscape(arb[1].split(',')[0])).test(css);
  return false;
}

let failures = 0;
const report = [];

for (const page of PAGES) {
  const html = read(page);
  const css = sharedCss + inlineStyles(html);
  const ids = idsOf(html);

  const brokenAnchors = [...html.matchAll(/href="#([^"]+)"/g)]
    .map((m) => m[1])
    .filter((a) => a !== 'main' && !ids.has(a));

  const missing = [...classesOf(html)].filter((c) => !hasRule(css, c));

  if (brokenAnchors.length || missing.length) {
    report.push(`\n${page}`);
    if (brokenAnchors.length) report.push(`  broken anchors: ${brokenAnchors.join(', ')}`);
    if (missing.length) report.push(`  classes with no CSS rule: ${missing.join(', ')}`);
    failures += brokenAnchors.length + missing.length;
  }
}

// Cross-page anchors into the features page.
if (existsSync(join(ROOT, 'features.html'))) {
  const fxIds = idsOf(read('features.html'));
  for (const page of PAGES) {
    const broken = [...read(page).matchAll(/href="(?:\.\.\/)?features\.html#([^"]+)"/g)]
      .map((m) => m[1])
      .filter((a) => !fxIds.has(a));
    if (broken.length) {
      report.push(`\n${page}\n  broken features.html anchors: ${broken.join(', ')}`);
      failures += broken.length;
    }
  }
}

if (failures) {
  console.error(report.join('\n'));
  console.error(`\nFAIL — ${failures} issue(s) across ${PAGES.length} pages.`);
  process.exit(1);
}
console.log(`OK — ${PAGES.length} pages: all classes have rules, all anchors resolve.`);
