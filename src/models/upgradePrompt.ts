/** Fewest saved sessions before the ImuaTrak+ prompt may appear. */
export const PROMPT_MIN_SESSIONS = 3;
/** Minimum days between two showings of the prompt. */
export const PROMPT_INTERVAL_DAYS = 30;

/** Whether the prompt is due: enough sessions saved, and not shown recently. */
export function upgradePromptDue(
  sessionCount: number,
  lastShownMs: number | null,
  nowMs: number,
): boolean {
  if (sessionCount < PROMPT_MIN_SESSIONS) return false;
  if (lastShownMs == null) return true;
  return nowMs - lastShownMs >= PROMPT_INTERVAL_DAYS * 86_400_000;
}
