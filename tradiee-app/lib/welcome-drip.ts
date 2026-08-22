// Pure day-boundary logic for the trial welcome-email drip (day 7/14/21 +
// day-before-trial-end), split out so it's unit-testable without a live cron
// run. Day 0 isn't here — it fires synchronously from the signup route, not
// this list, since it has no "elapsed time" condition to get wrong.
export type WelcomeDripStage = 'day7' | 'day14' | 'day21' | 'trial_ending'

// Order matters: eligibleWelcomeDripStages() returns every stage a company
// has reached, and the caller sends the FIRST one not yet logged as sent.
// That makes a missed cron run self-heal (a 25-day-old company that somehow
// never got day7 gets it now, not day21) instead of permanently skipping a
// stage, while still sending at most one drip email per company per run.
export const WELCOME_DRIP_STAGE_ORDER: WelcomeDripStage[] = ['day7', 'day14', 'day21', 'trial_ending']

export function eligibleWelcomeDripStages({
  daysSinceSignup, daysUntilTrialEnd,
}: { daysSinceSignup: number; daysUntilTrialEnd: number }): WelcomeDripStage[] {
  const stages: WelcomeDripStage[] = []
  if (daysSinceSignup >= 7) stages.push('day7')
  if (daysSinceSignup >= 14) stages.push('day14')
  if (daysSinceSignup >= 21) stages.push('day21')
  if (daysUntilTrialEnd <= 1) stages.push('trial_ending')
  return stages
}
