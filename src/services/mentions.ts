/**
 * @-mentions in club chat.
 *
 * A mention is stored two ways: the literal `@Display Name` stays in the
 * message text (so the message reads correctly anywhere, including in a push
 * notification), and the mentioned uids are stored alongside it. Matching text
 * back to people is therefore only ever a rendering concern — the uid list is
 * the source of truth for who gets alerted.
 */

export interface MentionTarget {
  uid: string;
  name: string;
}

export interface MentionSpan {
  start: number;
  /** Exclusive. */
  end: number;
  uid: string;
  name: string;
}

/** Characters that can't sit next to a mention without breaking it. */
const WORD = /[A-Za-z0-9_]/;

/**
 * Locate every `@Name` in the text that refers to one of `targets`.
 *
 * Longer names win, so "@Ken Davis" is one mention of Ken Davis rather than a
 * mention of Ken followed by a stray surname. Spans never overlap, and the
 * result is ordered by position so it can drive rendering directly.
 */
export function findMentionSpans(text: string, targets: MentionTarget[]): MentionSpan[] {
  const haystack = text.toLowerCase();
  const byLength = targets
    .filter((t) => t.name.trim().length > 0)
    .slice()
    .sort((a, b) => b.name.length - a.name.length);

  const spans: MentionSpan[] = [];
  const taken = new Array<boolean>(text.length).fill(false);

  for (const target of byLength) {
    const needle = `@${target.name.trim()}`.toLowerCase();
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(needle, from);
      if (at < 0) break;
      const end = at + needle.length;
      from = at + 1;

      // "@" must open a token (not land mid-word or inside an email address),
      // and the name must end on a boundary so "@Ken" doesn't match "@Kendall".
      const before = at > 0 ? text[at - 1]! : " ";
      const after = end < text.length ? text[end]! : " ";
      if (WORD.test(before) || before === "@") continue;
      if (WORD.test(after)) continue;

      let overlaps = false;
      for (let i = at; i < end; i++) if (taken[i]) { overlaps = true; break; }
      if (overlaps) continue;

      for (let i = at; i < end; i++) taken[i] = true;
      spans.push({ start: at, end, uid: target.uid, name: text.slice(at + 1, end) });
    }
  }

  return spans.sort((a, b) => a.start - b.start);
}

/** The uids actually mentioned in the text, in order of first appearance. */
export function resolveMentions(text: string, targets: MentionTarget[]): string[] {
  const seen = new Set<string>();
  for (const span of findMentionSpans(text, targets)) seen.add(span.uid);
  return [...seen];
}

/**
 * The in-progress `@query` immediately before the caret, if the user is
 * currently typing a mention. Returns null once they type a space that doesn't
 * continue a known name — the caller decides when to give up on the lookup.
 */
export function mentionQueryAt(
  text: string,
  cursor: number,
): { query: string; start: number } | null {
  const upToCursor = text.slice(0, Math.max(0, cursor));
  // Allow one space inside the query so "@Ken D" still finds "Ken Davis";
  // more than that is almost certainly ordinary prose, not a name.
  const match = upToCursor.match(/(?:^|\s)@([^\s@]*(?:[ \t][^\s@]*)?)$/);
  if (!match) return null;
  const query = match[1] ?? "";
  return { query, start: upToCursor.length - query.length - 1 };
}

/**
 * Replace the in-progress query with the chosen name, leaving the caret after
 * the trailing space so the user can keep typing.
 */
export function applyMention(
  text: string,
  start: number,
  cursor: number,
  name: string,
): { text: string; cursor: number } {
  const head = text.slice(0, start);
  const tail = text.slice(Math.max(start, cursor));
  // Don't double up the separator when completing a mention mid-sentence.
  const inserted = `@${name.trim()}${/^\s/.test(tail) ? "" : " "}`;
  return { text: `${head}${inserted}${tail}`, cursor: head.length + inserted.length };
}

/**
 * Rank members against a partially typed mention. An empty query lists
 * everyone (the moment "@" is typed), otherwise names starting with the query
 * come before names merely containing it.
 */
export function matchMentionCandidates<T extends MentionTarget>(
  query: string,
  targets: T[],
  limit = 6,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return targets.slice(0, limit);
  const starts: T[] = [];
  const contains: T[] = [];
  for (const t of targets) {
    const name = t.name.toLowerCase();
    if (name.startsWith(q)) starts.push(t);
    else if (name.includes(q)) contains.push(t);
  }
  return [...starts, ...contains].slice(0, limit);
}
