const mockState = { width: 4032, height: 3024, fail: false, resizedTo: null as null | object };

jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: () => {
      const ctx = {
        resize: (size: object) => {
          mockState.resizedTo = size;
          return ctx;
        },
        renderAsync: async () => {
          if (mockState.fail) throw new Error("decode failed");
          return {
            width: mockState.width,
            height: mockState.height,
            saveAsync: async () => ({ uri: "file:///resized.jpg" }),
          };
        },
      };
      return ctx;
    },
  },
}));

import { prepareImageForUpload } from "../imageResize";

beforeEach(() => {
  mockState.width = 4032;
  mockState.height = 3024;
  mockState.fail = false;
  mockState.resizedTo = null;
});

describe("prepareImageForUpload", () => {
  it("shrinks a big landscape photo to 2048 wide, as JPEG", async () => {
    expect(await prepareImageForUpload("file:///a.heic", "image/heic")).toEqual({
      uri: "file:///resized.jpg",
      mimeType: "image/jpeg",
    });
    expect(mockState.resizedTo).toEqual({ width: 2048 });
  });

  it("limits portrait photos by height, and honours a custom max", async () => {
    mockState.width = 3024;
    mockState.height = 4032;
    await prepareImageForUpload("file:///a.jpg", "image/jpeg", 1024);
    expect(mockState.resizedTo).toEqual({ height: 1024 });
  });

  it("leaves screen-sized images alone (a small PNG stays a PNG)", async () => {
    mockState.width = 1170;
    mockState.height = 2000;
    expect(await prepareImageForUpload("file:///s.png", "image/png")).toEqual({
      uri: "file:///s.png",
      mimeType: "image/png",
    });
    expect(mockState.resizedTo).toBeNull();
  });

  it("never touches videos or GIFs", async () => {
    expect(await prepareImageForUpload("file:///v.mp4", "video/mp4")).toEqual({ uri: "file:///v.mp4", mimeType: "video/mp4" });
    expect(await prepareImageForUpload("file:///g.gif", "image/gif")).toEqual({ uri: "file:///g.gif", mimeType: "image/gif" });
    expect(mockState.resizedTo).toBeNull();
  });

  it("falls back to the original if the image can't be processed", async () => {
    mockState.fail = true;
    expect(await prepareImageForUpload("file:///a.jpg", "image/jpeg")).toEqual({
      uri: "file:///a.jpg",
      mimeType: "image/jpeg",
    });
  });
});
