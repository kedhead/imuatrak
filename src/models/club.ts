// Club-related types. Kept separate from session models to avoid bloating the core.

export type ClubId = string;
export type MemberRole = "owner" | "admin" | "coach" | "member";
export type SubscriptionStatus = "trial" | "active" | "expired";
export type SubscriptionTier = "basic" | "pro";
export type EventType = "practice" | "race" | "social";
export type PostType = "announcement" | "post";
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
  commentCount: number;
  createdAt: string;
  updatedAt: string;
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
