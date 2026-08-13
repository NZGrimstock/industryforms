// Runnable check for who gets pushed when a job-thread message is posted
// (jobThreadRecipients in lib/push.ts). This is the one branch in the job
// messaging feature that can leak information: pushing someone who can't
// open the thread would surface a job's contents to a staff member RLS
// deliberately excludes (migration 20260701082916).
//
// Run:  node scripts/check-job-thread-recipients.mjs   (from tradiee-app/)
// Exits non-zero on a regression.

import assert from 'node:assert/strict'
import { jobThreadRecipients } from '../lib/push.ts'

const tok = id => ({ id, expo_push_token: `tok_${id}` })
const ids = rows => rows.map(r => r.id).sort()

// ── The author never gets pushed about their own message ───────────────────
{
  const people = [
    { ...tok('admin'), role: 'admin' },
    { ...tok('tech'), role: 'staff' },
  ]
  const out = jobThreadRecipients(people, new Set(['tech']), 'admin')
  assert.deepEqual(ids(out), ['tech'], 'author must not be pushed their own message')
}

// ── Staff who are NOT on the job are never pushed ──────────────────────────
// The important one: RLS won't let an unassigned staff member read this job,
// so pushing them would leak the message body in the notification itself.
{
  const people = [
    { ...tok('admin'), role: 'admin' },
    { ...tok('assigned-tech'), role: 'staff' },
    { ...tok('other-tech'), role: 'staff' },
  ]
  const out = jobThreadRecipients(people, new Set(['assigned-tech']), 'admin')
  assert.deepEqual(ids(out), ['assigned-tech'], 'unassigned staff must not be pushed')
}

// ── Every assignee is pushed, not just the primary ─────────────────────────
// job_assignees exists precisely because multi-worker jobs are real; a second
// worker on the job has to see the conversation too.
{
  const people = [
    { ...tok('admin'), role: 'admin' },
    { ...tok('tech-a'), role: 'staff' },
    { ...tok('tech-b'), role: 'staff' },
  ]
  const out = jobThreadRecipients(people, new Set(['tech-a', 'tech-b']), 'tech-a')
  assert.deepEqual(ids(out), ['admin', 'tech-b'], 'all other assignees + admins should be pushed')
}

// ── Owners and admins always get the thread, assigned or not ───────────────
{
  const people = [
    { ...tok('owner'), role: 'owner' },
    { ...tok('admin'), role: 'admin' },
    { ...tok('tech'), role: 'staff' },
  ]
  const out = jobThreadRecipients(people, new Set(['tech']), 'tech')
  assert.deepEqual(ids(out), ['admin', 'owner'], 'owner/admin see every job thread')
}

// ── People without a push token are skipped, not sent `undefined` ──────────
// Expo rejects the whole batch on a malformed `to`, so one tokenless profile
// would silently drop everyone else's notification too.
{
  const people = [
    { ...tok('admin'), role: 'admin' },
    { id: 'tokenless-admin', role: 'admin', expo_push_token: null },
    { ...tok('tech'), role: 'staff' },
  ]
  const out = jobThreadRecipients(people, new Set(['tech']), 'tech')
  assert.deepEqual(ids(out), ['admin'], 'profiles without a push token must be dropped')
  assert.ok(out.every(p => !!p.expo_push_token), 'no null token may reach the Expo payload')
}

// ── A lone author with nobody else on the job pushes nobody ────────────────
{
  const out = jobThreadRecipients(
    [{ ...tok('solo'), role: 'owner' }],
    new Set(['solo']),
    'solo',
  )
  assert.deepEqual(out, [], 'a one-person company must not push itself')
}

console.log('check-job-thread-recipients: all assertions passed')
