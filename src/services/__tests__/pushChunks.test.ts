import {
  EXPO_PUSH_REQUEST_LIMIT,
  chunkPushMessages,
} from "../../../firebase/functions/src/pushChunks";

const msg = (n: number, tag: string) => ({
  to: Array.from({ length: n }, (_, i) => `${tag}-${i}`),
  title: tag,
});
const tokenCount = (c: { messages: { to: string[] }[] }) =>
  c.messages.reduce((sum, m) => sum + m.to.length, 0);

describe("chunkPushMessages", () => {
  it("keeps every request at or under Expo's per-token limit", () => {
    // 60 members with 2 devices each: 60 messages but 120 notifications. The
    // old message-count slicing sent this as ONE request, which Expo rejects.
    const messages = Array.from({ length: 60 }, (_, i) => msg(2, `u${i}`));
    const owners = messages.map((_, i) => `u${i}`);
    const chunks = chunkPushMessages(messages, owners);
    expect(chunks.length).toBe(2);
    for (const c of chunks) expect(tokenCount(c)).toBeLessThanOrEqual(EXPO_PUSH_REQUEST_LIMIT);
    expect(chunks.reduce((s, c) => s + tokenCount(c), 0)).toBe(120);
  });

  it("splits one message across requests and keeps its owner on each part", () => {
    const chunks = chunkPushMessages([msg(99, "a"), msg(5, "b")], ["ua", "ub"]);
    expect(chunks.map(tokenCount)).toEqual([100, 4]);
    expect(chunks[0]!.owners).toEqual(["ua", "ub"]);
    expect(chunks[1]!.owners).toEqual(["ub"]);
    // Order preserved, nothing duplicated or dropped.
    const all = chunks.flatMap((c) => c.messages.flatMap((m) => m.to));
    expect(all).toEqual([...msg(99, "a").to, ...msg(5, "b").to]);
  });

  it("keeps owners parallel to messages within every chunk", () => {
    const messages = Array.from({ length: 250 }, (_, i) => msg(1, `u${i}`));
    const chunks = chunkPushMessages(messages, messages.map((m) => m.title));
    for (const c of chunks) {
      expect(c.owners.length).toBe(c.messages.length);
      c.messages.forEach((m, j) => expect(m.title).toBe(c.owners[j]));
    }
    expect(chunks.map(tokenCount)).toEqual([100, 100, 50]);
  });

  it("handles a single huge recipient list and an empty input", () => {
    expect(chunkPushMessages([msg(250, "x")], ["x"]).map(tokenCount)).toEqual([100, 100, 50]);
    expect(chunkPushMessages([], [])).toEqual([]);
  });

  it("skips messages with no tokens instead of sending empty requests", () => {
    expect(chunkPushMessages([msg(0, "a")], ["a"])).toEqual([]);
  });
});
