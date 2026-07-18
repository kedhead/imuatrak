import { create } from "zustand";
import type { Club, ClubMember, MemberRole, UserClubs } from "@/models/club";
import { getUserClubs, getClub, getMyRole, getClubMembers } from "./clubService";

interface ClubState {
  // Current club context
  club: Club | null;
  role: MemberRole | null;
  members: ClubMember[];
  // All clubs the user belongs to
  userClubs: UserClubs | null;
  loaded: boolean;
  /** Set when load() failed (network/Firestore error) — drives a Retry UI. */
  loadError: string | null;

  load(uid: string): Promise<void>;
  switchClub(clubId: string, uid: string): Promise<void>;
  setClub(club: Club, role: MemberRole): void;
  clearClub(): void;
}

export const useClub = create<ClubState>((set, get) => ({
  club: null,
  role: null,
  members: [],
  userClubs: null,
  loaded: false,
  loadError: null,

  async load(uid: string) {
    // A Firestore failure here must never strand the club tab on its spinner:
    // without the catch, a rejected read left `loaded` false forever.
    // Resetting `loaded` makes Retry show the spinner again instead of
    // flashing the "no club" screen while the refetch runs.
    set({ loaded: false, loadError: null });
    try {
      const userClubs = await getUserClubs(uid);
      if (!userClubs || !userClubs.activeClubId) {
        set({ userClubs, loaded: true });
        return;
      }
      await get().switchClub(userClubs.activeClubId, uid);
      set({ userClubs, loaded: true });
    } catch (e) {
      set({ loaded: true, loadError: e instanceof Error ? e.message : String(e) });
    }
  },

  async switchClub(clubId: string, uid: string) {
    const [club, role, members] = await Promise.all([
      getClub(clubId),
      getMyRole(clubId, uid),
      getClubMembers(clubId),
    ]);
    set({ club, role, members });
  },

  setClub(club: Club, role: MemberRole) {
    set({ club, role });
  },

  clearClub() {
    set({ club: null, role: null, members: [], userClubs: null, loaded: false, loadError: null });
  },
}));
