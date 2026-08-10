// Club types shared between mobile and web (mirrored from src/models/club.ts)

export type MemberRole = "owner" | "admin" | "coach" | "member";
export type SubscriptionStatus = "trial" | "active" | "expired";
export type EventType = "practice" | "race" | "social";
export type PostType = "announcement" | "post";
export type RsvpStatus = "going" | "maybe" | "not_going";

export interface Club {
  id: string;
  name: string;
  slug: string;
  description: string;
  logoUrl?: string;
  websiteUrl?: string;
  location: { city: string; country: string };
  ownerId: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionTier: "basic" | "pro";
  trialEndsAt?: string;
  memberCount: number;
  createdAt: string;
}

export interface ClubMember {
  uid: string;
  role: MemberRole;
  displayName: string;
  avatarUrl?: string;
  joinedAt: string;
}

export interface ClubEvent {
  id: string;
  title: string;
  description?: string;
  type: EventType;
  startAt: string;
  endAt: string;
  location?: { name: string };
  meetTime?: string;
  meetLocation?: string;
  createdBy: string;
  rsvps: { uid: string; status: RsvpStatus }[];
  linkedSessionIds: string[];
}

export type ChannelIconType = "emoji" | "ionicon";

export interface ClubChannel {
  id: string;
  clubId: string;
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

export interface ClubMessage {
  id: string;
  clubId: string;
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
  /** Uids @-mentioned in `content` — the source of truth for who was tagged. */
  mentions?: string[];
  /** Set when this message is a reply to another. */
  replyTo?: { messageId: string; authorName: string; preview: string };
  createdAt: string;
}

export interface ClubPost {
  id: string;
  type: PostType;
  content: string;
  authorId: string;
  authorName: string;
  pinnedUntil?: string;
  linkedSessionId?: string;
  likeCount: number;
  commentCount: number;
  createdAt: string;
}
