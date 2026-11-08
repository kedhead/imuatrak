/**
 * Split push messages into requests the Expo Push Service will accept.
 *
 * Expo caps one request at 100 NOTIFICATIONS, and a message with several
 * tokens in `to` counts once per token — see chunkPushNotifications in
 * expo-server-sdk, which this mirrors. sendExpoPush used to slice 100
 * MESSAGES per request instead, so once a channel's recipients had more than
 * 100 devices between them (multi-device members, plus stale tokens on older
 * accounts) Expo rejected the whole request and nobody in it got the push.
 * Worse, a rejected request returns no tickets, so the DeviceNotRegistered
 * pruning that would have shrunk the token count never ran either.
 *
 * A message is split across requests when it has to be, and `owners` is kept
 * parallel to `messages` within each chunk so failed tickets can still be
 * attributed to the account they belong to.
 *
 * Pure (no Firebase imports) so it can be unit-tested from the app's Jest.
 */
export const EXPO_PUSH_REQUEST_LIMIT = 100;

export interface PushChunk<M> {
  messages: M[];
  owners: string[];
}

export function chunkPushMessages<M extends { to: string[] }>(
  messages: M[],
  owners: string[],
  limit: number = EXPO_PUSH_REQUEST_LIMIT,
): PushChunk<M>[] {
  const chunks: PushChunk<M>[] = [];
  let current: PushChunk<M> = { messages: [], owners: [] };
  let count = 0;

  const flush = () => {
    if (current.messages.length > 0) chunks.push(current);
    current = { messages: [], owners: [] };
    count = 0;
  };

  messages.forEach((message, i) => {
    const owner = owners[i] ?? "";
    let remaining = message.to;
    while (remaining.length > 0) {
      const room = limit - count;
      const take = remaining.slice(0, room);
      current.messages.push({ ...message, to: take });
      current.owners.push(owner);
      count += take.length;
      remaining = remaining.slice(take.length);
      if (count >= limit) flush();
    }
  });
  flush();
  return chunks;
}
