import { useEffect, useState } from "react";
import type { MemberRole } from "@/models/club";
import { subscribeChannels, subscribeChannelUnread } from "./clubService";
import { subscribeDmUnread } from "./dmService";

/**
 * Live count of unread chat messages in ONE club.
 *
 * Deliberately not the user doc's `unreadTotal`: that is summed across every
 * club a paddler belongs to, so on a multi-club account it would light this
 * club's chat icon for messages in a different club. Summing the per-channel
 * counts of the channels visible here keeps the indicator honest.
 *
 * Both listeners are live, so the icon lights the moment a message lands while
 * the user is sitting on the Club tab, and clears as soon as they read it.
 */
export function useClubUnreadCount(
  clubId: string | undefined,
  uid: string | undefined,
  role: MemberRole | null,
): number {
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [unreadByChannel, setUnreadByChannel] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!clubId || !uid) {
      setChannelIds([]);
      return;
    }
    // Same visibility rule as the Channels screen: private channels count only
    // for their members (staff can see them all).
    return subscribeChannels(clubId, (channels) => {
      setChannelIds(
        channels
          .filter(
            (ch) =>
              !ch.isPrivate ||
              ch.memberIds.includes(uid) ||
              role === "owner" ||
              role === "admin",
          )
          .map((ch) => ch.id),
      );
    });
  }, [clubId, uid, role]);

  useEffect(() => {
    if (!uid) {
      setUnreadByChannel({});
      return;
    }
    return subscribeChannelUnread(uid, setUnreadByChannel);
  }, [uid]);

  return channelIds.reduce((sum, id) => sum + (unreadByChannel[id] ?? 0), 0);
}

/**
 * Live unread DM counts keyed by thread id.
 *
 * Thread ids are derived from the sorted uid pair (see dmThreadId), so a caller
 * holding a member's uid can look up that conversation without loading any
 * threads — which is how the roster marks who has messaged you.
 */
export function useDmUnreadByThread(uid: string | undefined): Record<string, number> {
  const [byThread, setByThread] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!uid) {
      setByThread({});
      return;
    }
    return subscribeDmUnread(uid, setByThread);
  }, [uid]);

  return byThread;
}

/**
 * Live count of unread direct messages, across every thread.
 *
 * Unlike club chat this is genuinely global — a DM isn't scoped to a club, so
 * there is nothing to filter it down to.
 */
export function useDmUnreadCount(uid: string | undefined): number {
  const byThread = useDmUnreadByThread(uid);
  return Object.values(byThread).reduce((sum, n) => sum + n, 0);
}
