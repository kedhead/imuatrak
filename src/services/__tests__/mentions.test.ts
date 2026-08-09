import {
  applyMention,
  caretAfterEdit,
  findMentionSpans,
  matchMentionCandidates,
  mentionQueryAt,
  resolveMentions,
  type MentionTarget,
} from "../mentions";

const ROSTER: MentionTarget[] = [
  { uid: "u1", name: "Kendall" },
  { uid: "u2", name: "Ken Davis" },
  { uid: "u3", name: "Ken" },
  { uid: "u4", name: "Leilani" },
];

describe("findMentionSpans", () => {
  it("matches a whole name and not a longer one that starts with it", () => {
    const spans = findMentionSpans("hey @Ken can you steer", ROSTER);
    expect(spans.map((s) => s.uid)).toEqual(["u3"]);
  });

  it("prefers the longest matching name", () => {
    const spans = findMentionSpans("@Ken Davis is on seat 3", ROSTER);
    expect(spans.map((s) => s.uid)).toEqual(["u2"]);
  });

  it("does not match a name embedded in a longer word", () => {
    expect(findMentionSpans("@Kendalls", ROSTER)).toEqual([]);
    expect(findMentionSpans("mail me at hi@Ken.com", ROSTER)).toEqual([]);
  });

  it("matches case-insensitively and reports the text's own casing", () => {
    const spans = findMentionSpans("@leilani you in?", ROSTER);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.uid).toBe("u4");
    expect(spans[0]!.name).toBe("leilani");
  });

  it("returns non-overlapping spans in document order", () => {
    const spans = findMentionSpans("@Leilani and @Ken Davis, practice at 6", ROSTER);
    expect(spans.map((s) => s.uid)).toEqual(["u4", "u2"]);
    expect(spans[0]!.start).toBeLessThan(spans[1]!.start);
    expect(spans[0]!.end).toBeLessThanOrEqual(spans[1]!.start);
  });

  it("allows trailing punctuation right after a mention", () => {
    expect(findMentionSpans("thanks @Ken!", ROSTER).map((s) => s.uid)).toEqual(["u3"]);
  });
});

describe("resolveMentions", () => {
  it("returns each mentioned uid once, in the order they appear", () => {
    expect(resolveMentions("@Ken @Leilani @Ken again", ROSTER)).toEqual(["u3", "u4"]);
  });

  it("returns nothing when no one is mentioned", () => {
    expect(resolveMentions("practice at 6", ROSTER)).toEqual([]);
    expect(resolveMentions("@nobody", ROSTER)).toEqual([]);
  });
});

describe("mentionQueryAt", () => {
  it("finds the query being typed at the caret", () => {
    const text = "hey @Ke";
    expect(mentionQueryAt(text, text.length)).toEqual({ query: "Ke", start: 4 });
  });

  it("fires on a bare @ so the whole roster can be offered", () => {
    expect(mentionQueryAt("hey @", 5)).toEqual({ query: "", start: 4 });
  });

  it("keeps matching across one space so surnames are reachable", () => {
    const text = "@Ken D";
    expect(mentionQueryAt(text, text.length)).toEqual({ query: "Ken D", start: 0 });
  });

  it("gives up after two spaces", () => {
    const text = "@Ken Davis is";
    expect(mentionQueryAt(text, text.length)).toBeNull();
  });

  it("ignores an @ glued to the previous word", () => {
    const text = "mail hi@ke";
    expect(mentionQueryAt(text, text.length)).toBeNull();
  });

  it("only looks behind the caret", () => {
    const text = "@Ken later";
    expect(mentionQueryAt(text, 2)).toEqual({ query: "K", start: 0 });
  });
});

describe("applyMention", () => {
  it("replaces the query and leaves the caret after the space", () => {
    const text = "hey @Ke";
    const q = mentionQueryAt(text, text.length)!;
    const next = applyMention(text, q.start, text.length, "Ken Davis");
    expect(next.text).toBe("hey @Ken Davis ");
    expect(next.cursor).toBe(next.text.length);
  });

  it("keeps text that follows the caret without doubling the space", () => {
    const text = "@Ke are you in";
    const next = applyMention(text, 0, 3, "Kendall");
    expect(next.text).toBe("@Kendall are you in");
    expect(next.cursor).toBe("@Kendall".length);
  });
});

describe("caretAfterEdit", () => {
  it("puts the caret at the end when a character is typed there", () => {
    expect(caretAfterEdit("", "@")).toBe(1);
    expect(caretAfterEdit("hey", "hey ")).toBe(4);
    expect(caretAfterEdit("hey @", "hey @K")).toBe(6);
  });

  it("handles a paste at the end", () => {
    expect(caretAfterEdit("hey ", "hey @Kendall")).toBe(12);
  });

  it("follows a backspace at the end", () => {
    expect(caretAfterEdit("hey @K", "hey @")).toBe(5);
    expect(caretAfterEdit("@", "")).toBe(0);
  });

  it("declines to guess on a mid-text edit", () => {
    // Inserting before existing text — only the selection event knows where
    // the caret landed, so this must not claim the end of the string.
    expect(caretAfterEdit("hey there", "hey @ there")).toBeNull();
    expect(caretAfterEdit("hey there", "oh hey there")).toBeNull();
    // Same-length replacement (autocorrect).
    expect(caretAfterEdit("teh", "the")).toBeNull();
  });

  it("drives the picker from the first keystroke without a selection event", () => {
    // The regression: cursor pinned at 0 meant mentionQueryAt never saw the @.
    const text = "@";
    const caret = caretAfterEdit("", text)!;
    expect(mentionQueryAt(text, caret)).toEqual({ query: "", start: 0 });
  });
});

describe("matchMentionCandidates", () => {
  it("ranks prefix matches above substring matches", () => {
    expect(matchMentionCandidates("ken", ROSTER).map((t) => t.uid)).toEqual(["u1", "u2", "u3"]);
  });

  it("lists everyone for an empty query", () => {
    expect(matchMentionCandidates("", ROSTER)).toHaveLength(4);
  });

  it("respects the limit", () => {
    expect(matchMentionCandidates("", ROSTER, 2)).toHaveLength(2);
  });
});
