jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
let mockSignedInAs: string | null = "kai";
jest.mock("../auth", () => ({ currentUser: () => (mockSignedInAs ? { uid: mockSignedInAs, displayName: null } : null) }));
jest.mock("../clubService", () => ({
  getUserClubs: jest.fn(),
  getClub: jest.fn(),
  getMyRole: jest.fn(),
  getClubMembers: jest.fn(),
  setActiveClub: jest.fn(async () => undefined),
  updateMemberDisplayName: jest.fn(async () => undefined),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useClub } from "../clubStore";
import { readCache } from "../localCache";

const mockApi = jest.requireMock("../clubService") as Record<
  "getUserClubs" | "getClub" | "getMyRole" | "getClubMembers",
  jest.Mock
>;

const flush = () => new Promise((r) => setTimeout(r, 0));
const club = (id: string, name: string) => ({ id, name });
const online = (activeClubId = "c1", name = "Hui Wa'a") => {
  mockApi.getUserClubs.mockResolvedValue({ activeClubId, clubIds: [activeClubId] });
  mockApi.getClub.mockImplementation(async (id: string) => club(id, name));
  mockApi.getMyRole.mockResolvedValue("member");
  mockApi.getClubMembers.mockResolvedValue([{ uid: "kai", displayName: "Kai" }]);
};
const offline = () => {
  for (const f of [mockApi.getUserClubs, mockApi.getClub, mockApi.getMyRole, mockApi.getClubMembers]) {
    f.mockRejectedValue(new Error("network down"));
  }
};

beforeEach(async () => {
  jest.clearAllMocks();
  mockSignedInAs = "kai";
  await AsyncStorage.clear();
  useClub.setState({ club: null, role: null, members: [], userClubs: null, myClubs: [], loaded: false, loadError: null });
});

describe("useClub.load", () => {
  it("first ever launch: loads from the network and saves a copy", async () => {
    online();
    await useClub.getState().load("kai");
    await flush();
    expect(useClub.getState()).toMatchObject({ loaded: true, loadError: null, role: "member" });
    expect(useClub.getState().club).toEqual(club("c1", "Hui Wa'a"));
    expect((await readCache<{ club: { id: string } }>("kai", "club"))?.club.id).toBe("c1");
  });

  it("next launch: shows the saved club before the network answers, then refreshes", async () => {
    online();
    await useClub.getState().load("kai");
    await flush();
    useClub.setState({ club: null, role: null, members: [], userClubs: null, myClubs: [], loaded: false });

    // Network hangs until we release it.
    let release!: () => void;
    mockApi.getUserClubs.mockReturnValue(new Promise((r) => { release = () => r({ activeClubId: "c1", clubIds: ["c1"] }); }));
    mockApi.getClub.mockImplementation(async (id: string) => club(id, "Renamed club"));
    const loading = useClub.getState().load("kai");
    await flush();
    expect(useClub.getState().loaded).toBe(true);
    expect(useClub.getState().club).toEqual(club("c1", "Hui Wa'a"));

    release();
    await loading;
    expect(useClub.getState().club).toEqual(club("c1", "Renamed club"));
  });

  it("offline with a saved club: keeps showing it, no error screen", async () => {
    online();
    await useClub.getState().load("kai");
    await flush();
    useClub.setState({ club: null, role: null, members: [], userClubs: null, myClubs: [], loaded: false });
    offline();
    await useClub.getState().load("kai");
    expect(useClub.getState()).toMatchObject({ loaded: true, loadError: null });
    expect(useClub.getState().club?.id).toBe("c1");
  });

  it("offline with nothing saved: shows the error so Retry appears", async () => {
    offline();
    await useClub.getState().load("kai");
    expect(useClub.getState()).toMatchObject({ loaded: true, loadError: "network down", club: null });
  });

  it("never shows one account's saved club to another", async () => {
    online();
    await useClub.getState().load("kai");
    await flush();
    useClub.setState({ club: null, role: null, members: [], userClubs: null, myClubs: [], loaded: false });
    mockSignedInAs = "noa";
    offline();
    await useClub.getState().load("noa");
    expect(useClub.getState().club).toBeNull();
  });

  it("sign-out wipes the saved copy", async () => {
    online();
    await useClub.getState().load("kai");
    await flush();
    useClub.getState().clearClub();
    await flush();
    expect(await readCache("kai", "club")).toBeNull();
    expect(useClub.getState().club).toBeNull();
  });

  it("a refresh that finishes after sign-out doesn't put the club back", async () => {
    let release!: () => void;
    mockApi.getUserClubs.mockReturnValue(new Promise((r) => { release = () => r({ activeClubId: "c1", clubIds: ["c1"] }); }));
    mockApi.getClub.mockResolvedValue(club("c1", "Hui Wa'a"));
    mockApi.getMyRole.mockResolvedValue("member");
    mockApi.getClubMembers.mockResolvedValue([]);
    const loading = useClub.getState().load("kai");
    await flush();
    mockSignedInAs = null;
    useClub.getState().clearClub();
    release();
    await loading;
    await flush();
    expect(useClub.getState().club).toBeNull();
  });

  it("left every club: clears the saved copy instead of showing a stale club", async () => {
    online();
    await useClub.getState().load("kai");
    await flush();
    mockApi.getUserClubs.mockResolvedValue({ activeClubId: null, clubIds: [] });
    await useClub.getState().load("kai");
    await flush();
    expect(useClub.getState().club).toBeNull();
    expect(await readCache("kai", "club")).toBeNull();
  });
});
