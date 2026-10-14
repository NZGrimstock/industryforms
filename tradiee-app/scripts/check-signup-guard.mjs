// Signup abuse guard. Run from tradiee-app/:  node scripts/check-signup-guard.mjs
import assert from 'node:assert/strict'
import { containsLink, signupTextError, escapeHtml } from '../lib/signup-guard.ts'

// The actual attack payloads (Sep 30 – Oct 1 2026).
for (const s of [
  '🌶️70.000TL🌶️bonusla🌶️atesi🌶️yak!🌶️Oyna!🌶️https://bit.ly/3T62CBe🌶️',
  '🌶️70.000 TL bonusla atesi yak! Oyna! https://bit.ly/3T62CBe 🌶️',
  'win big bit.ly/abc', 'see www.example.com', 'casino.bet now', 'join t.me/somechannel',
]) assert.equal(containsLink(s), true, `should flag: ${s}`)

// Real names and businesses must pass.
for (const s of [
  'Josh Grimstock', "Mary-Jane O'Neill", 'Ngāti Whātua Electrical Ltd', 'J. Smith & Sons Plumbing',
  'Smith Bros. Builders', 'A1 Roofing (Kaipara) Ltd', 'Dr. Sparks', 'Hēmi Te Rangi',
]) assert.equal(containsLink(s), false, `should allow: ${s}`)

assert.equal(signupTextError('Josh Grimstock', 'Kaipara Electrical Ltd'), null)
assert.match(signupTextError('🌶️ https://bit.ly/x', 'Ltd'), /link/)
assert.match(signupTextError('x'.repeat(81), 'Ltd'), /too long/)
assert.match(signupTextError('Josh', 'y'.repeat(121)), /too long/)

assert.equal(escapeHtml(`<a href="x">Tom & 'Jo'</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jo&#39;&lt;/a&gt;')

console.log('check-signup-guard: all assertions passed')
