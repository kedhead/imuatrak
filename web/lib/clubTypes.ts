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
