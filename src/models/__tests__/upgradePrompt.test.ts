import { PROMPT_INTERVAL_DAYS, PROMPT_MIN_SESSIONS, upgradePromptDue } from "../upgradePrompt";

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 27);

describe("upgradePromptDue", () => {
  it("waits for the third saved session", () => {
    expect(PROMPT_MIN_SESSIONS).toBe(3);
    expect(upgradePromptDue(2, null, now)).toBe(false);
    expect(upgradePromptDue(3, null, now)).toBe(true);
  });

  it("shows at most once per interval", () => {
    expect(PROMPT_INTERVAL_DAYS).toBe(30);
    expect(upgradePromptDue(10, now - 29 * DAY, now)).toBe(false);
    expect(upgradePromptDue(10, now - 30 * DAY, now)).toBe(true);
  });

  it("never shows below the session threshold, however long ago", () => {
    expect(upgradePromptDue(1, now - 365 * DAY, now)).toBe(false);
  });
});
