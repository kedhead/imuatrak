// Club-related types. Kept separate from session models to avoid bloating the core.

export type ClubId = string;
export type MemberRole = "owner" | "admin" | "coach" | "member";
export type SubscriptionStatus = "trial" | "active" | "expired";
export type SubscriptionTier = "basic" | "pro";
export type EventType = "practice" | "race" | "social";
export type PostType = "announcement" | "post" | "poll";

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
  memberCount: number;
  createdAt: string;
}

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
}

export interface SeatAssignment {
  seatNumber: number;
  uid: string | null;
}

export interface BoatAssignment {
  boatName: string;
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
  // Poll fields — present only when type === "poll"
  pollOptions?: PollOption[];
  pollVotes?: Record<string, string[]>; // key = option index string, value = voter UIDs
  pollMultipleChoice?: boolean;
  pollEndsAt?: string;
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
  /** Set when this message is a reply to another. */
  replyTo?: { messageId: string; authorName: string; preview: string };
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

export interface FcmToken {
  token: string;
  platform: "ios" | "android";
  updatedAt: string;
}
