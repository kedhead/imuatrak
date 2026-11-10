import { create } from "zustand";
import type { Club, ClubMember, MemberRole, UserClubs } from "@/models/club";
import { currentUser } from "./auth";
import { clearCache, readCache, writeCache } from "./localCache";
import {
  getUserClubs,
  getClub,
  getMyRole,
  getClubMembers,
  setActiveClub as persistActiveClub,
  updateMemberDisplayName,
} from "./clubService";

interface ClubState {
  // Current club context
  club: Club | null;
  role: MemberRole | null;
  members: ClubMember[];
  // All clubs the user belongs to
  userClubs: UserClubs | null;
  /** Full club docs for every membership — drives the club switcher. */
  myClubs: Club[];
  loaded: boolean;
  /** Set when load() failed (network/Firestore error) — drives a Retry UI. */
  loadError: string | null;

  load(uid: string): Promise<void>;
  switchClub(clubId: string, uid: string): Promise<void>;
  /** Switch clubs AND persist the choice as the user's active club. */
  setActiveClub(clubId: string, uid: string): Promise<void>;
  setClub(club: Club, role: MemberRole): void;
  clearClub(): void;
}

/** What's kept on the phone so the club tab can paint before the network. */
type ClubSnapshot = Pick<ClubState, "club" | "role" | "members" | "userClubs" | "myClubs">;
const CACHE_NAME = "club";

function saveSnapshot(uid: string, s: ClubState): void {
  if (!s.club) return;
  writeCache<ClubSnapshot>(uid, CACHE_NAME, {
    club: s.club,
    role: s.role,
    members: s.members,
    userClubs: s.userClubs,
    myClubs: s.myClubs,
  });
}

/** Still the same person signed in? Guards every write after an await. */
const stillSignedInAs = (uid: string) => currentUser()?.uid === uid;

export const useClub = create<ClubState>((set, get) => ({
  club: null,
  role: null,
  members: [],
  userClubs: null,
  myClubs: [],
  loaded: false,
  loadError: null,

  async load(uid: string) {
    set({ loadError: null });

    // Paint the last-known club straight away (if this is a cold start and
    // nothing is on screen yet), then refresh from the network underneath.
    // Without this every launch sat on a spinner through three sequential
    // round trips, which on beach signal read as the app stalling.
    let showingCache = get().club !== null;
    if (!showingCache) {
      const cached = await readCache<ClubSnapshot>(uid, CACHE_NAME);
      if (cached?.club && stillSignedInAs(uid) && get().club === null) {
        set({ ...cached, loaded: true });
        showingCache = true;
      } else {
        // Resetting `loaded` makes Retry show the spinner again instead of
        // flashing the "no club" screen while the refetch runs.
        set({ loaded: false });
      }
    }
    const clubOnScreen = get().club?.id ?? null;

    // A Firestore failure here must never strand the club tab on its spinner:
    // without the catch, a rejected read left `loaded` false forever.
    try {
      const userClubs = await getUserClubs(uid);
      if (!stillSignedInAs(uid)) return;
      if (!userClubs || !userClubs.activeClubId) {
        set({ club: null, role: null, members: [], userClubs, myClubs: [], loaded: true });
        void clearCache();
        return;
      }
      // If the paddler switched clubs while this refresh was in flight, keep
      // their choice rather than snapping back to the stored active club.
      const target =
        get().club?.id && get().club?.id !== clubOnScreen ? get().club!.id : userClubs.activeClubId;
      await get().switchClub(target, uid);
      if (!stillSignedInAs(uid)) return;
      set({ userClubs, loaded: true });
      saveSnapshot(uid, get());
      // Fetch the rest of the memberships for the switcher after the active
      // club is on screen — it's a list-only concern, never worth delaying
      // the club tab (or failing it: a dead club id just drops out).
      void Promise.all(userClubs.clubIds.map((id) => getClub(id).catch(() => null)))
        .then((clubs) => {
          if (!stillSignedInAs(uid)) return;
          set({ myClubs: clubs.filter((c): c is Club => c !== null) });
          saveSnapshot(uid, get());
        })
        .catch(() => undefined);
    } catch (e) {
      // With cached data on screen a failed refresh is just "offline": keep
      // showing what we have rather than replacing it with an error screen.
      if (showingCache) return;
      set({ loaded: true, loadError: e instanceof Error ? e.message : String(e) });
    }
  },

  async switchClub(clubId: string, uid: string) {
    const [club, role, members] = await Promise.all([
      getClub(clubId),
      getMyRole(clubId, uid),
      getClubMembers(clubId),
    ]);

    // Self-heal the roster name. Member docs snapshot the display name at
    // join time, and joins can race the profile write during email sign-up
    // (the auth listener resumes a pending invite the moment the account
    // exists, before updateProfile lands) — leaving the literal "Member" in
    // the roster forever. Whenever the loaded member doc disagrees with the
    // auth profile, repair it here; this runs on every sign-in/app start, so
    // already-broken rosters fix themselves too.
    const authName = currentUser()?.displayName?.trim();
    const me = members.find((m) => m.uid === uid);
    if (authName && me && me.displayName !== authName) {
      void updateMemberDisplayName(clubId, uid, authName).catch(() => undefined);
      me.displayName = authName;
    }

    if (!stillSignedInAs(uid)) return;
    set({ club, role, members });
  },

  async setActiveClub(clubId: string, uid: string) {
    await get().switchClub(clubId, uid);
    // Persist after the switch succeeds so a failed load doesn't strand the
    // stored pointer on a club the UI never actually showed.
    await persistActiveClub(uid, clubId).catch(() => undefined);
    const userClubs = get().userClubs;
    if (userClubs) set({ userClubs: { ...userClubs, activeClubId: clubId } });
    saveSnapshot(uid, get());
  },

  setClub(club: Club, role: MemberRole) {
    set({ club, role });
  },

  clearClub() {
    // Sign-out or leaving a club: nothing cached should outlive it.
    void clearCache();
    set({ club: null, role: null, members: [], userClubs: null, myClubs: [], loaded: false, loadError: null });
  },
}));
