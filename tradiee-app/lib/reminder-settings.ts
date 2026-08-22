// Pure timing logic for company_reminder_settings-driven invoice dunning
// (app/api/reminders/route.ts), split out so the boundary conditions are
// unit-testable without a live cron run. Quote follow-up timing doesn't need
// this — it's just an enabled check plus a repeat interval written back to
// quotes.follow_up_at, no window/throttle math to get subtly wrong.
export function shouldSendInvoiceReminder({
  daysFromDue, dueSoonDays, lastReminderAt, repeatDays, now = Date.now(),
}: {
  /** now - due_date, in whole days. Negative = not yet due, positive = overdue. */
  daysFromDue: number
  dueSoonDays: number
  lastReminderAt: string | null
  repeatDays: number
  now?: number
}): boolean {
  const overdue = daysFromDue > 0
  if (!overdue && -daysFromDue > dueSoonDays) return false // outside this company's configured due-soon window
  if (lastReminderAt && now - new Date(lastReminderAt).getTime() < repeatDays * 86400000) return false
  return true
}
