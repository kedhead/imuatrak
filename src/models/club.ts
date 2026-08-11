// Club-related types. Kept separate from session models to avoid bloating the core.

export type ClubId = string;
export type MemberRole = "owner" | "admin" | "coach" | "member";
export type SubscriptionStatus = "trial" | "active" | "expired";
export type SubscriptionTier = "basic" | "pro";
export type EventType = "practice" | "race" | "social";
/**
 * "photo" is the club gallery. It shares the posts collection so likes,
 * comments, deletion and moderation all work unchanged — but unlike the other
 * types any member may create one, and it renders in the gallery grid rather
 * than the Team Updates feed.
 */
export type PostType = "announcement" | "post" | "poll" | "photo";

export interface PollOption {
  text: string;
}
export type RsvpStatus = "going" | "maybe" | "not_going";

export interface Club {
  id: ClubId;
  name: string;
  slug: string;
  description: string;
  logoUrl?: string;
  websiteUrl?: string;
  sport: "outrigger";
  location: { city: string; country: string };
  ownerId: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionTier: SubscriptionTier;
  trialEndsAt?: string;
  subscriptionRenewsAt?: string;
  /** Set by the syncClubPlan/revenuecatWebhook Cloud Functions when an
   *  owner/admin's in-app club plan is keeping this club active. */
  clubPlan?: { payerUid: string; productId?: string | null; activatedAt?: string };
  memberCount: number;
  /**
   * Delete chat messages older than this many days. Absent or 0 keeps
   * everything, which is the default — a club has to opt in before anything
   * is deleted. Pinned messages are never swept.
   */
  chatRetentionDays?: number;
  createdAt: string;
}

/** Retention choices offered in club settings. 0 means keep everything. */
export const CHAT_RETENTION_OPTIONS: { days: number; label: string }[] = [
  { days: 0, label: "Keep all" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 180, label: "6 months" },
  { days: 365, label: "1 year" },
];

/**
 * Whether a club's subscription grants its members ad-free access right now.
 *
 * A "trial" only counts while trialEndsAt is still in the future — the
 * scheduled expireClubTrials Cloud Function flips overdue trials to "expired"
 * at most once a day, so the status string alone can lag reality. All club
 * timestamps are ISO-8601 UTC strings, so plain string comparison is safe.
 */
export function clubGrantsAdFree(
  club: Pick<Club, "subscriptionStatus" | "trialEndsAt"> | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!club) return false;
  if (club.subscriptionStatus === "active") return true;
  return (
    club.subscriptionStatus === "trial" &&
    typeof club.trialEndsAt === "string" &&
    club.trialEndsAt > now.toISOString()
  );
}

export interface ClubMember {
  uid: string;
  role: MemberRole;
  displayName: string;
  avatarUrl?: string;
  joinedAt: string;
  invitedBy?: string;
}

export interface EventRsvp {
  uid: string;
  status: RsvpStatus;
  updatedAt: string;
  /** Names of guest paddlers this member is bringing. Guests count toward
   *  attendance and capacity while the member's status is "going". */
  guests?: string[];
}

/** Going headcount including guests brought by going members. */
export function eventGoingCount(rsvps: EventRsvp[]): number {
  return rsvps.reduce(
    (n, r) => (r.status === "going" ? n + 1 + (r.guests?.length ?? 0) : n),
    0,
  );
}

export interface SeatAssignment {
  seatNumber: number;
  uid: string | null;
}

export type BoatType = "OC1" | "OC2" | "OC4" | "OC6" | "DB10" | "DB20";

/** A non-paddling crew seat, and where it sits in the boat. */
export interface CrewSeat {
  label: string;
  position: "bow" | "stern";
}

export interface BoatSpec {
  /**
   * Seats holding paddlers, numbered 1..n. Dragon boats pair these left/right
   * — odd numbers paddle left, even paddle right, so 1 and 2 share the bow
   * bench.
   */
  paddlerSeats: number;
  paired: boolean;
  /** Appended after the paddler seats, so paddler numbering stays 1..n. */
  crewSeats: CrewSeat[];
}

/**
 * The boats a club can set a lineup for.
 *
 * A dragon boat carries a drummer at the bow and a steer at the stern on top
 * of its paddlers, so a DB20 seats 22 people and a DB10 seats 12 — a DB10
 * halves the paddlers, not the crew. Outrigger hulls are single file and
 * carry no separate crew: an OC6's sixth seat steers while paddling.
 */
export const BOAT_SPECS: Record<BoatType, BoatSpec> = {
  OC1: { paddlerSeats: 1, paired: false, crewSeats: [] },
  OC2: { paddlerSeats: 2, paired: false, crewSeats: [] },
  OC4: { paddlerSeats: 4, paired: false, crewSeats: [] },
  OC6: { paddlerSeats: 6, paired: false, crewSeats: [] },
  DB10: {
    paddlerSeats: 10,
    paired: true,
    crewSeats: [
      { label: "Drummer", position: "bow" },
      { label: "Steer", position: "stern" },
    ],
  },
  DB20: {
    paddlerSeats: 20,
    paired: true,
    crewSeats: [
      { label: "Drummer", position: "bow" },
      { label: "Steer", position: "stern" },
    ],
  },
};

export const BOAT_TYPES = Object.keys(BOAT_SPECS) as BoatType[];

export function boatSeatCount(type: BoatType): number {
  const spec = BOAT_SPECS[type];
  return spec.paddlerSeats + spec.crewSeats.length;
}

/**
 * Best guess at the boat behind a lineup saved before boatType was stored.
 *
 * The dragon-boat sizes accept their pre-crew counts too (10 and 20), since
 * lineups created then had no drummer or steer seat at all.
 */
export function inferBoatType(seatCount: number): BoatType | null {
  switch (seatCount) {
    case 1: return "OC1";
    case 2: return "OC2";
    case 4: return "OC4";
    case 6: return "OC6";
    case 10:
    case 12: return "DB10";
    case 20:
    case 22: return "DB20";
    default: return null;
  }
}

export interface BoatAssignment {
  boatName: string;
  /** Absent on lineups saved before boat types existed — infer when reading. */
  boatType?: BoatType;
  seats: SeatAssignment[];
}

export interface ClubEvent {
  id: string;
  clubId: ClubId;
  title: string;
  description?: string;
  type: EventType;
  startAt: string;
  endAt: string;
  location?: { name: string; lat?: number; lon?: number };
  meetTime?: string;
  meetLocation?: string;
  maxParticipants?: number;
  boatAssignments?: BoatAssignment[];
  createdBy: string;
  rsvps: EventRsvp[];
  linkedSessionIds: string[];
}

export interface ClubPost {
  id: string;
  clubId: ClubId;
  type: PostType;
  content: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string;
  pinnedUntil?: string;
  linkedSessionId?: string;
  likeCount: number;
  likedBy?: string[];
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  /** Download URLs in upload order — present only when type === "photo". */
  mediaUrls?: string[];
  /**
   * Hashtags from the caption, normalised by `parseHashtags` — lower-cased and
   * without the leading "#", so "#RaceDay" and "#raceday" filter as one tag.
   */
  tags?: string[];
  /** Uids of members tagged in the photo ("who's in this shot"). */
  taggedUids?: string[];
  // Poll fields — present only when type === "poll"
  pollOptions?: PollOption[];
  pollVotes?: Record<string, string[]>; // key = option index string, value = voter UIDs
  pollMultipleChoice?: boolean;
  pollEndsAt?: string;
}

/** Caps how many tags one photo post carries, so a caption can't become a
 *  filter list of its own. */
export const MAX_POST_TAGS = 10;

/**
 * A fresh hashtag matcher. Returns a new object each call because the `g` flag
 * makes `lastIndex` stateful — a shared instance would skip matches when used
 * for both parsing and rendering.
 */
export function hashtagRegex(): RegExp {
  return /#([\p{L}\p{N}_]{1,30})/gu;
}

/**
 * Pull the hashtags out of a caption, normalised for storage: lower-cased,
 * "#" stripped, de-duplicated, in first-seen order.
 */
export function parseHashtags(caption: string): string[] {
  const seen = new Set<string>();
  for (const m of caption.matchAll(hashtagRegex())) {
    const tag = m[1]!.toLowerCase();
    if (!seen.has(tag)) seen.add(tag);
    if (seen.size >= MAX_POST_TAGS) break;
  }
  return [...seen];
}

export interface ClubComment {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}

export interface UserClubs {
  clubIds: string[];
  activeClubId: string;
}

export interface ClubMessage {
  id: string;
  clubId: ClubId;
  channelId: string;
  content: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string;
  mediaUrl?: string;
  mediaStoragePath?: string;
  mediaType?: "photo" | "video";
  /** Multi-image messages: download URLs in send order (grid rendering). */
  mediaUrls?: string[];
  /** Emoji reactions: emoji → uids of members who reacted. */
  reactions?: Record<string, string[]>;
  /**
   * Uids of members @-mentioned in `content`. Stored explicitly rather than
   * re-parsed from the text: display names change, and a mention has to keep
   * pointing at the person who was actually tagged. Drives the highlight in
   * the bubble and the push alert that ignores a muted channel.
   */
  mentions?: string[];
  /** Set when this message is a reply to another. */
  replyTo?: { messageId: string; authorName: string; preview: string };
  /**
   * When an owner/admin pinned this message. Pinned messages are exempt from
   * the club's chat retention sweep — pinning is how a club says "keep this",
   * so expiry has to honour it or the setting would quietly delete the very
   * messages someone marked as worth keeping.
   */
  pinnedAt?: string;
  pinnedBy?: string;
  createdAt: string;
}

export type ChannelIconType = "emoji" | "ionicon";

export interface ClubChannel {
  id: string;
  clubId: ClubId;
  name: string;
  icon: string;
  iconType: ChannelIconType;
  description?: string;
  isPrivate: boolean;
  memberIds: string[];
  createdBy: string;
  createdAt: string;
  sortOrder: number;
  lastMessageAt?: string;
}

export interface ChannelPreference {
  muteNotifications: boolean;
  lastReadAt: string;
  // Unread message count for this channel; summed across channels into the
  // user doc's unreadTotal for the app-icon badge. Maintained server-side.
  unreadCount?: number;
}

// ── Direct messages ──────────────────────────────────────────────────────────
//
// DMs live at the top level, NOT under clubs/{clubId}/channels. A two-person
// private channel would have been far less work, but the private-channel rule
// grants owners and admins read access for moderation — applied to DMs that
// would let club admins read their members' private messages, which is not
// what "private message" means to anyone. Living outside clubs also means a
// thread survives either person leaving a club, isn't deleted by a club's chat
// retention sweep, and doesn't count against a club's channel limit.

export interface DmThread {
  /** Exactly two uids, sorted — see dmThreadId. */
  participants: string[];
  /** Denormalized so a thread list can render without reading two rosters. */
  participantNames: Record<string, string>;
  participantAvatars?: Record<string, string>;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  createdAt: string;
}

export interface DmMessage {
  id: string;
  threadId: string;
  content: string;
  authorId: string;
  authorName: string;
  reactions?: Record<string, string[]>;
  replyTo?: { messageId: string; authorName: string; preview: string };
  createdAt: string;
}

/**
 * Deterministic thread id for a pair of users.
 *
 * Sorting means both people compute the same id, so a conversation can't fork
 * into two threads depending on who messaged first.
 */
export function dmThreadId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join("__");
}

export interface FcmToken {
  token: string;
  platform: "ios" | "android";
  updatedAt: string;
}
