// Club-related types. Kept separate from session models to avoid bloating the core.

export type ClubId = string;
export type MemberRole = "owner" | "admin" | "coach" | "member";
// "free" is the default for a newly created club: no plan, ads shown, Pro
// features locked. Clubs are NOT put on an automatic trial — a trial is now
// opt-in. "trial"/"active" grant ad-free + Pro; "expired" is a lapsed
// trial/plan (same access as "free", but labeled so the owner sees it ended).
export type SubscriptionStatus = "free" | "trial" | "active" | "expired";
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
  /** Set once, server-side, when an owner opts into the one-time free trial.
   *  Its presence is the durable proof a club has already used its trial. */
  trialStartedAt?: string;
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
  /**
   * How the owner appears to the club (chat badge, roster, profile). Some
   * clubs' app owner isn't the club's real owner, so they can show as an
   * admin or with no badge. Display only — permissions use the real role.
   * Absent means "owner".
   */
  ownerBadge?: OwnerBadge;
  createdAt: string;
}

export type OwnerBadge = "owner" | "admin" | "none";

export const OWNER_BADGE_OPTIONS: { value: OwnerBadge; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "none", label: "No badge" },
];

/** The role to SHOW for someone, honouring the club's ownerBadge choice.
 *  Never use it for permission checks. */
export function displayRole(
  role: MemberRole,
  club: { ownerBadge?: OwnerBadge } | null | undefined,
): MemberRole {
  if (role !== "owner") return role;
  switch (club?.ownerBadge) {
    case "admin":
      return "admin";
    case "none":
      return "member";
    default:
      return "owner";
  }
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

/**
 * Whether a club is on a paid (or still-valid trial) plan, which unlocks the
 * Pro-tier features — the photo gallery and additional chat channels — on top
 * of ad-free access. Same condition as clubGrantsAdFree today; named separately
 * so feature-gating call sites read clearly and the two can diverge later
 * (e.g. a cheaper ad-free-only tier) without hunting every reference.
 */
export function clubIsPro(
  club: Pick<Club, "subscriptionStatus" | "trialEndsAt"> | null | undefined,
  now: Date = new Date(),
): boolean {
  return clubGrantsAdFree(club, now);
}

/** Chat channels a free (basic) club may have — the default "general" only.
 *  Additional channels require the Pro club plan. Mirrored server-side in
 *  createChannel (firebase/functions/src/index.ts). */
export const FREE_CHANNEL_LIMIT = 1;

/**
 * Whether an owner/admin may create another channel: always on a paid or
 * trialling club, otherwise only while the club is under FREE_CHANNEL_LIMIT.
 * A free club that somehow has no channel (one created before General was
 * made automatically) can therefore still create its one.
 */
export function canAddChannel(
  club: Pick<Club, "subscriptionStatus" | "trialEndsAt"> | null | undefined,
  channelCount: number,
  now: Date = new Date(),
): boolean {
  return clubIsPro(club, now) || channelCount < FREE_CHANNEL_LIMIT;
}

/** A paddler's preferred rigging side, so coaches can seat them correctly. */
export type PaddleSide = "left" | "right" | "either";

export interface ClubMember {
  uid: string;
  role: MemberRole;
  displayName: string;
  avatarUrl?: string;
  joinedAt: string;
  invitedBy?: string;
  /** Birthday as "MM-DD" (no year — only month/day is needed to celebrate it,
   *  and it keeps the paddler's age private). */
  birthday?: string;
  /** Preferred paddling side. Absent means not set. */
  paddleSide?: PaddleSide;
}

/** Short label for a paddling side, or null when unset. */
export function paddleSideLabel(side: PaddleSide | undefined): string | null {
  switch (side) {
    case "left": return "Left";
    case "right": return "Right";
    case "either": return "Either";
    default: return null;
  }
}

/** True when the "MM-DD" birthday falls on `now`'s month/day. */
export function isBirthdayToday(birthday: string | undefined, now: Date = new Date()): boolean {
  if (!birthday) return false;
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return birthday === `${mm}-${dd}`;
}

/** Format a "MM-DD" birthday as e.g. "Aug 20", or null when unset/invalid. */
export function formatBirthday(birthday: string | undefined): string | null {
  if (!birthday) return null;
  const [mm, dd] = birthday.split("-").map(Number);
  if (!mm || !dd) return null;
  return new Date(2000, mm - 1, dd).toLocaleDateString([], { month: "short", day: "numeric" });
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

/**
 * A guest paddler occupying a seat.
 *
 * Guests have no account and no uid — they exist only as names inside the
 * host member's `EventRsvp.guests`. So a seat identifies one by the member who
 * registered them plus the name that member gave, which stays stable when the
 * host adds or removes other guests (an index would not).
 */
export interface SeatGuest {
  hostUid: string;
  name: string;
}

export interface SeatAssignment {
  seatNumber: number;
  uid: string | null;
  /**
   * Set when a guest holds this seat instead of a member; `uid` is null then.
   * Absent on every lineup saved before guests could be seated, so read it as
   * optional and always WRITE an explicit null rather than undefined — the
   * Firestore instance in services/firebase.ts does not set
   * ignoreUndefinedProperties, so an undefined field throws on write.
   */
  guest?: SeatGuest | null;
}

/**
 * Every guest that can be given a seat: those registered by members who are
 * actually going. A guest whose host is "maybe" or "not going" is not on the
 * water, so they are not offered.
 */
export function seatableGuests(rsvps: EventRsvp[]): SeatGuest[] {
  return rsvps
    .filter((r) => r.status === "going")
    .flatMap((r) => (r.guests ?? []).map((name) => ({ hostUid: r.uid, name })));
}

/** Whether two seat references point at the same registered guest. */
export function isSameGuest(a?: SeatGuest | null, b?: SeatGuest | null): boolean {
  return !!a && !!b && a.hostUid === b.hostUid && a.name === b.name;
}

/**
 * Whether a seated guest is still registered for the event.
 *
 * A host can remove a guest, or drop to "not going", after the coach has
 * seated them. The seat is NOT auto-cleared when that happens: Firestore rules
 * let a plain member write only `rsvps`, so a member removing their own guest
 * cannot touch `boatAssignments` — attempting it would fail the whole removal
 * on a permission error. The lineup instead marks the seat as stale so staff,
 * who can write it, notice and clear it.
 */
export function isGuestStillGoing(guest: SeatGuest, rsvps: EventRsvp[]): boolean {
  return seatableGuests(rsvps).some((g) => isSameGuest(g, guest));
}

/** Whoever can hold a seat: a club member, or a registered guest. */
export type SeatOccupant = { uid: string } | { guest: SeatGuest };

/** Whether this seat is currently held by that exact person. */
export function seatHolds(seat: SeatAssignment, occupant: SeatOccupant): boolean {
  if ("uid" in occupant) return seat.uid === occupant.uid;
  return seat.uid == null && isSameGuest(seat.guest, occupant.guest);
}

/** Which seat a person currently occupies, if any. */
export function findSeatOf(
  boats: BoatAssignment[],
  occupant: SeatOccupant,
): { boatIdx: number; seatIdx: number } | null {
  for (let b = 0; b < boats.length; b++) {
    const seats = boats[b]!.seats;
    for (let s = 0; s < seats.length; s++) {
      if (seatHolds(seats[s]!, occupant)) return { boatIdx: b, seatIdx: s };
    }
  }
  return null;
}

/**
 * Put someone in a seat, or clear it, returning a new set of boats.
 *
 * Nobody can sit in two places at once, so this MOVES rather than copies:
 * assigning a person who already holds a seat vacates that one first, across
 * every boat and not just the one being edited. The picker offers everyone who
 * is going regardless of whether they are already seated, so without this a
 * coach could seat the same paddler twice and the lineup would claim more crew
 * than actually turned up.
 *
 * Occupant fields are always written as an explicit pair — Firestore has no
 * ignoreUndefinedProperties here, and writing only one of them would leave the
 * previous occupant behind when swapping a member for a guest.
 */
export function assignSeat(
  boats: BoatAssignment[],
  boatIdx: number,
  seatIdx: number,
  occupant: SeatOccupant | null,
): BoatAssignment[] {
  const next: BoatAssignment[] = JSON.parse(JSON.stringify(boats));
  const target = next[boatIdx]?.seats[seatIdx];
  if (!target) return next;

  if (occupant) {
    for (const boat of next) {
      for (const seat of boat.seats) {
        if (seatHolds(seat, occupant)) {
          seat.uid = null;
          seat.guest = null;
        }
      }
    }
  }

  target.uid = occupant && "uid" in occupant ? occupant.uid : null;
  target.guest = occupant && "guest" in occupant ? occupant.guest : null;
  return next;
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
  /** Download URLs in upload order. Gallery posts (type "photo") always have
   *  them; feed posts may too, since announcements can carry a flyer. */
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
  /** Set when the author edited the message, so the bubble can show "edited". */
  editedAt?: string;
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
  /** Two uids (sorted) for a direct message; 3+ for a group chat. */
  participants: string[];
  /** Group chats only — member-created via createGroupChat. A group is
   *  private to its participants exactly like a DM: club staff can't read it
   *  unless they've been added. */
  isGroup?: boolean;
  name?: string;
  /** The club a group was made from; only its members can be added. */
  clubId?: string;
  createdBy?: string;
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
  /** Photo attachments, mirroring ClubMessage: a single photo lands on
   *  mediaUrl, several on mediaUrls (rendered as a grid). Images only — the
   *  callable upload's payload cap makes video impractical here. */
  mediaUrl?: string;
  mediaUrls?: string[];
  mediaStoragePath?: string;
  mediaType?: "photo";
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

// ── Sign-up sheets ──────────────────────────────────────────────────────────
//
// A sign-up sheet is a list of things to bring or jobs to cover ("Desserts ×3",
// "Tent setup ×2") hung off a club event — a potluck is just a social event
// with a sheet. Items live in clubs/{clubId}/events/{eventId}/signupItems so
// each one can be claimed independently without rewriting the event doc.
//
// Claims are a MAP keyed by uid, not an array: Firestore rules can then check
// that a member only added or removed their own key, which an array can't
// express (see the RSVP carve-out in firestore.rules). One claim per person
// per item.

export interface SignupClaim {
  /** Display name when claimed, so the sheet still reads after someone leaves. */
  name: string;
  /** What they're bringing — "Kalua pig", "Chips + salsa". Optional. */
  note?: string;
  claimedAt: string;
}

export interface SignupItem {
  id: string;
  label: string;
  /** Extra detail from the organizer — "Serves 10", "Bring a cooler". */
  details?: string;
  /** How many people can take this item. */
  slots: number;
  /** Sort key. Staff items are ordered as added; write-ins sort after. */
  order: number;
  createdBy: string;
  createdAt: string;
  /** True when a member added it themselves via "Bring something else". */
  writeIn?: boolean;
  claims: Record<string, SignupClaim>;
}

export const SIGNUP_LABEL_MAX = 60;
export const SIGNUP_NOTE_MAX = 80;
export const SIGNUP_SLOTS_MAX = 50;
/** Keeps one sheet from becoming an unbounded list of reads. */
export const SIGNUP_ITEMS_MAX = 40;

export interface SignupTemplateItem {
  label: string;
  slots: number;
  details?: string;
}

export interface SignupTemplate {
  id: string;
  emoji: string;
  name: string;
  blurb: string;
  items: readonly SignupTemplateItem[];
}

/**
 * Starting points staff can drop onto a sheet in one tap, then edit. They
 * stack — a regatta can take Race-day gear AND Volunteers — so keep each one
 * focused on a single kind of job.
 */
export const SIGNUP_TEMPLATES: readonly SignupTemplate[] = [
  {
    id: "potluck",
    emoji: "🥘",
    name: "Potluck",
    blurb: "Mains, sides, desserts, drinks",
    items: [
      { label: "Main dish", slots: 4, details: "Serves 8–10" },
      { label: "Side dish / salad", slots: 4 },
      { label: "Pūpū / appetizers", slots: 3 },
      { label: "Dessert", slots: 3 },
      { label: "Drinks + ice", slots: 2 },
      { label: "Plates, cups & utensils", slots: 1 },
    ],
  },
  {
    id: "gear",
    emoji: "🛶",
    name: "Race-day gear",
    blurb: "Tent, coolers, spares, first aid",
    items: [
      { label: "Pop-up tent", slots: 2 },
      { label: "Canoe trailer / tow", slots: 1 },
      { label: "Spare paddles", slots: 2 },
      { label: "Bailers", slots: 2 },
      { label: "Lashing ropes & bungees", slots: 1 },
      { label: "First-aid kit", slots: 1 },
      { label: "Cooler with ice", slots: 2 },
      { label: "Tables & chairs", slots: 2 },
    ],
  },
  {
    id: "volunteers",
    emoji: "🙋",
    name: "Volunteers",
    blurb: "Rigging, escort boat, setup, cleanup",
    items: [
      { label: "Rig canoes", slots: 4, details: "Arrive an hour early" },
      { label: "Escort boat crew", slots: 2 },
      { label: "Tent setup", slots: 3 },
      { label: "Check-in / registration", slots: 2 },
      { label: "Photographer", slots: 1 },
      { label: "De-rig & cleanup", slots: 4 },
    ],
  },
  {
    id: "snacks",
    emoji: "🍉",
    name: "Practice snacks",
    blurb: "Water, fruit, post-paddle fuel",
    items: [
      { label: "Water jug", slots: 1 },
      { label: "Fruit", slots: 2 },
      { label: "Snacks", slots: 2 },
      { label: "Electrolyte drinks", slots: 1 },
    ],
  },
];

export function claimCount(item: SignupItem): number {
  return Object.keys(item.claims ?? {}).length;
}

export function openSlots(item: SignupItem): number {
  return Math.max(0, item.slots - claimCount(item));
}

export function hasClaimed(item: SignupItem, uid: string | null | undefined): boolean {
  return !!uid && !!item.claims?.[uid];
}

/** Total filled vs. total slots across a sheet, for the section header. */
export function signupProgress(items: SignupItem[]): { filled: number; total: number } {
  let filled = 0;
  let total = 0;
  for (const item of items) {
    // A slot count lowered under existing claims shouldn't read as >100%.
    filled += Math.min(claimCount(item), item.slots);
    total += item.slots;
  }
  return { filled, total };
}

/** Staff items first in the order they were added, then write-ins by time. */
export function sortSignupItems(items: SignupItem[]): SignupItem[] {
  return [...items].sort(
    (a, b) =>
      Number(!!a.writeIn) - Number(!!b.writeIn) ||
      a.order - b.order ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

/** Claims oldest-first, so whoever signed up first is listed first. */
export function sortedClaims(item: SignupItem): (SignupClaim & { uid: string })[] {
  return Object.entries(item.claims ?? {})
    .map(([uid, c]) => ({ ...c, uid }))
    .sort((a, b) => a.claimedAt.localeCompare(b.claimedAt));
}

/** Clamp a typed slot count into the range rules accept. */
export function clampSlots(n: number, minimum = 1): number {
  if (!Number.isFinite(n)) return Math.max(1, minimum);
  return Math.min(SIGNUP_SLOTS_MAX, Math.max(1, minimum, Math.floor(n)));
}

// ── Surveys ─────────────────────────────────────────────────────────────────
//
// Club questionnaires (end-of-season feedback, race debriefs, practice-time
// polls). Staff build them; members answer once. Stored at
// clubs/{clubId}/surveys/{surveyId}, with answers in a `responses`
// subcollection. See firestore.rules for how anonymous surveys stay anonymous.

export type SurveyQuestionType = "single" | "multi" | "rating" | "text";

export interface SurveyQuestion {
  /** Stable key into a response's `answers` map. */
  id: string;
  type: SurveyQuestionType;
  prompt: string;
  /** Choices for single/multi. */
  options?: string[];
  required: boolean;
}

export interface Survey {
  id: string;
  title: string;
  description?: string;
  questions: SurveyQuestion[];
  /**
   * Anonymous responses carry no uid or name, and who-answered is tracked in a
   * separate `respondents` collection with no timestamps, so staff can see how
   * many answered but can't tie an answer to a person.
   */
  anonymous: boolean;
  status: "open" | "closed";
  /** Epoch ms. Rules refuse responses after it. */
  closesAt?: number;
  createdBy: string;
  createdAt: string;
}

/** A single answer: one choice, several, a 1–5 rating, or free text. */
export type SurveyAnswer = string | string[] | number;

export interface SurveyResponse {
  id: string;
  /** Present only on named (non-anonymous) surveys. */
  uid?: string;
  name?: string;
  answers: Record<string, SurveyAnswer>;
}

export const SURVEY_TITLE_MAX = 80;
export const SURVEY_PROMPT_MAX = 200;
export const SURVEY_OPTION_MAX = 60;
export const SURVEY_TEXT_ANSWER_MAX = 1000;
export const SURVEY_QUESTIONS_MAX = 25;
export const SURVEY_OPTIONS_MAX = 10;
export const SURVEY_RATING_MAX = 5;

export function isSurveyOpen(s: Pick<Survey, "status" | "closesAt">, now = Date.now()): boolean {
  return s.status === "open" && (s.closesAt == null || now < s.closesAt);
}

/** "Closes Fri, Nov 14" / "Closed" / "Open", for list rows and headers. */
export function surveyWhen(s: Pick<Survey, "status" | "closesAt">, now = Date.now()): string {
  if (!isSurveyOpen(s, now)) return "Closed";
  if (s.closesAt == null) return "Open";
  return `Closes ${new Date(s.closesAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`;
}

/** Is a question answered (for required checks)? Ratings count from 1. */
export function hasAnswer(q: SurveyQuestion, a: SurveyAnswer | undefined): boolean {
  if (a == null) return false;
  switch (q.type) {
    case "single":
      return typeof a === "string" && a.length > 0;
    case "multi":
      return Array.isArray(a) && a.length > 0;
    case "rating":
      return typeof a === "number" && a >= 1 && a <= SURVEY_RATING_MAX;
    case "text":
      return typeof a === "string" && a.trim().length > 0;
  }
}

/** Prompts of required questions still unanswered, in order. */
export function missingRequired(
  questions: SurveyQuestion[],
  answers: Record<string, SurveyAnswer>,
): string[] {
  return questions.filter((q) => q.required && !hasAnswer(q, answers[q.id])).map((q) => q.prompt);
}

/** Drop empty answers and trim text so stored responses stay small and tidy. */
export function cleanAnswers(
  questions: SurveyQuestion[],
  answers: Record<string, SurveyAnswer>,
): Record<string, SurveyAnswer> {
  const out: Record<string, SurveyAnswer> = {};
  for (const q of questions) {
    const a = answers[q.id];
    if (!hasAnswer(q, a)) continue;
    if (q.type === "text") out[q.id] = (a as string).trim().slice(0, SURVEY_TEXT_ANSWER_MAX);
    else if (q.type === "multi") out[q.id] = (a as string[]).filter((o) => q.options?.includes(o));
    else out[q.id] = a!;
  }
  return out;
}

export type QuestionResult =
  | { type: "single" | "multi"; answered: number; counts: { option: string; count: number }[] }
  | { type: "rating"; answered: number; average: number | null; counts: number[] }
  | { type: "text"; answered: number; answers: { text: string; name?: string }[] };

/** Tally one question across all responses, for the results screen. */
export function tallyQuestion(q: SurveyQuestion, responses: SurveyResponse[]): QuestionResult {
  const given = responses
    .map((r) => ({ a: r.answers?.[q.id], name: r.name }))
    .filter((x) => hasAnswer(q, x.a));
  switch (q.type) {
    case "single":
    case "multi": {
      const counts = (q.options ?? []).map((option) => ({
        option,
        count: given.filter((x) => (Array.isArray(x.a) ? x.a.includes(option) : x.a === option)).length,
      }));
      return { type: q.type, answered: given.length, counts };
    }
    case "rating": {
      const counts = Array.from({ length: SURVEY_RATING_MAX }, () => 0);
      let sum = 0;
      for (const x of given) {
        const n = x.a as number;
        counts[n - 1]! += 1;
        sum += n;
      }
      return {
        type: "rating",
        answered: given.length,
        average: given.length ? Math.round((sum / given.length) * 10) / 10 : null,
        counts,
      };
    }
    case "text":
      return {
        type: "text",
        answered: given.length,
        answers: given.map((x) => ({ text: x.a as string, ...(x.name ? { name: x.name } : {}) })),
      };
  }
}

/** Results as CSV (one row per response) for sharing or a spreadsheet. */
export function surveyToCsv(survey: Survey, responses: SurveyResponse[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = [...(survey.anonymous ? [] : ["Name"]), ...survey.questions.map((q) => q.prompt)];
  const rows = responses.map((r) => [
    ...(survey.anonymous ? [] : [r.name ?? ""]),
    ...survey.questions.map((q) => {
      const a = r.answers?.[q.id];
      return a == null ? "" : Array.isArray(a) ? a.join("; ") : String(a);
    }),
  ]);
  return [header, ...rows].map((row) => row.map(esc).join(",")).join("\n");
}

export interface SurveyTemplate {
  id: string;
  emoji: string;
  name: string;
  blurb: string;
  title: string;
  description?: string;
  anonymous: boolean;
  questions: Omit<SurveyQuestion, "id">[];
}

/** One-tap starting points; everything stays editable before publishing. */
export const SURVEY_TEMPLATES: readonly SurveyTemplate[] = [
  {
    id: "season",
    emoji: "🏁",
    name: "End of season",
    blurb: "How the season went and what to change",
    title: "End of season survey",
    description: "Help us plan next season. Takes about 3 minutes.",
    anonymous: true,
    questions: [
      { type: "rating", prompt: "How would you rate this season overall?", required: true },
      { type: "rating", prompt: "How well did practices prepare you for races?", required: false },
      {
        type: "multi",
        prompt: "Which practice times work for you?",
        options: ["Weekday mornings", "Weekday evenings", "Saturday", "Sunday"],
        required: false,
      },
      {
        type: "single",
        prompt: "Will you paddle with us next season?",
        options: ["Yes", "Maybe", "No"],
        required: true,
      },
      { type: "text", prompt: "What did you enjoy most?", required: false },
      { type: "text", prompt: "What should we change?", required: false },
    ],
  },
  {
    id: "race",
    emoji: "🛶",
    name: "Race debrief",
    blurb: "Quick feedback after a regatta",
    title: "Race debrief",
    anonymous: false,
    questions: [
      { type: "rating", prompt: "How did your race feel?", required: true },
      {
        type: "single",
        prompt: "How was the race-day logistics (rigging, tent, timing)?",
        options: ["Smooth", "Mostly fine", "Needs work"],
        required: false,
      },
      { type: "text", prompt: "One thing that went well", required: false },
      { type: "text", prompt: "One thing to work on", required: false },
    ],
  },
  {
    id: "practice",
    emoji: "📅",
    name: "Practice times",
    blurb: "Find the slots most people can make",
    title: "Practice time poll",
    anonymous: false,
    questions: [
      {
        type: "multi",
        prompt: "Which times can you usually make?",
        options: [
          "Weekdays 5–6:30am",
          "Weekdays 5:30–7pm",
          "Saturday morning",
          "Sunday morning",
        ],
        required: true,
      },
      {
        type: "single",
        prompt: "How many practices a week do you want?",
        options: ["1", "2", "3", "4+"],
        required: false,
      },
    ],
  },
];

/** What to call a thread in lists and headers: a group's name, or the other
 *  person in a DM. */
export function dmThreadTitle(t: Pick<DmThread, "isGroup" | "name" | "participants" | "participantNames">, myUid: string | undefined): string {
  if (t.isGroup) return t.name?.trim() || "Group chat";
  const other = t.participants.find((p) => p !== myUid);
  return (other && t.participantNames?.[other]) || "Member";
}

/** "Kai, Noa and 3 others" — the people in a group besides you. */
export function groupMemberSummary(t: Pick<DmThread, "participants" | "participantNames">, myUid: string | undefined): string {
  const names = t.participants
    .filter((p) => p !== myUid)
    .map((p) => (t.participantNames?.[p] ?? "Member").split(" ")[0]!);
  if (names.length <= 3) return names.length === 0 ? "Just you" : names.join(", ").replace(/, ([^,]*)$/, " and $1");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} others`;
}

/**
 * Whether a conversation the user hid should stay off their list. Hiding is
 * per-person (users/{uid}/dmThreads/{threadId}.hiddenAt) and lasts only until
 * the conversation moves on: a message newer than the hide, or anything
 * unread, brings it back. Unread is checked too because lastMessageAt is
 * updated by the sender's client and could lag the message itself.
 */
export function isDmThreadHidden(
  t: Pick<DmThread, "lastMessageAt" | "createdAt">,
  hiddenAt: string | undefined,
  unread = 0,
): boolean {
  if (!hiddenAt || unread > 0) return false;
  return (t.lastMessageAt ?? t.createdAt) <= hiddenAt;
}

// ── RSVP edits ──────────────────────────────────────────────────────────────
// Pure "what the rsvps array looks like after this tap". Shared by the event
// screen (to update instantly, before the save lands) and clubService (which
// applies the same change to the server's copy), so the two can't disagree.

/** Set a member's RSVP. Guests survive status flip-flops (going → maybe →
 *  going) unless an explicit new list is passed; they only count while going. */
export function withRsvp(
  rsvps: EventRsvp[],
  uid: string,
  status: RsvpStatus,
  guests?: string[],
  now: string = new Date().toISOString(),
): EventRsvp[] {
  const existing = rsvps.find((r) => r.uid === uid);
  const kept = guests ?? existing?.guests;
  return [
    ...rsvps.filter((r) => r.uid !== uid),
    { uid, status, updatedAt: now, ...(kept && kept.length > 0 ? { guests: kept } : {}) },
  ];
}

/** Add one guest to a member's RSVP. Bringing a guest implies you're going. */
export function withGuestAdded(
  rsvps: EventRsvp[],
  uid: string,
  name: string,
  now: string = new Date().toISOString(),
): EventRsvp[] {
  const existing = rsvps.find((r) => r.uid === uid);
  return withRsvp(rsvps, uid, "going", [...(existing?.guests ?? []), name], now);
}
