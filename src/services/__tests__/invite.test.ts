import {
  extractInviteIdentifier,
  inviteLink,
  inviteShareMessage,
  looksLikeInvite,
} from "../invite";

describe("extractInviteIdentifier", () => {
  it("reads a plain web invite link", () => {
    expect(extractInviteIdentifier("https://imuatrak.app/join/aB3xY9zQ1mNpKrLt2VcD")).toBe(
      "aB3xY9zQ1mNpKrLt2VcD",
    );
  });

  it("reads the link out of the full share message", () => {
    const msg = inviteShareMessage("Hui Nalu", inviteLink("aB3xY9zQ1mNpKrLt2VcD"));
    expect(extractInviteIdentifier(msg)).toBe("aB3xY9zQ1mNpKrLt2VcD");
  });

  it("ignores a query string, fragment or trailing punctuation", () => {
    expect(extractInviteIdentifier("https://imuatrak.app/join/hui-nalu?utm=sms")).toBe("hui-nalu");
    expect(extractInviteIdentifier("see https://imuatrak.app/join/hui-nalu.")).toBe("hui-nalu");
    expect(extractInviteIdentifier("(https://imuatrak.app/join/hui-nalu)")).toBe("hui-nalu");
  });

  it("accepts a link with no scheme", () => {
    expect(extractInviteIdentifier("imuatrak.app/join/hui-nalu")).toBe("hui-nalu");
  });

  it("reads the imuatrak:// deep link the website bounces through", () => {
    expect(extractInviteIdentifier("imuatrak://club/join?slug=hui-nalu")).toBe("hui-nalu");
    expect(extractInviteIdentifier("imuatrak://club/join?code=a3f9c2d8e1b0")).toBe("a3f9c2d8e1b0");
  });

  it("percent-decodes a deep-link identifier", () => {
    expect(extractInviteIdentifier("imuatrak://club/join?slug=hui%2Dnalu")).toBe("hui-nalu");
  });

  it("accepts a bare id, slug or one-time code", () => {
    expect(extractInviteIdentifier("aB3xY9zQ1mNpKrLt2VcD")).toBe("aB3xY9zQ1mNpKrLt2VcD");
    expect(extractInviteIdentifier("hui-nalu")).toBe("hui-nalu");
    expect(extractInviteIdentifier("  a3f9c2d8e1b0  ")).toBe("a3f9c2d8e1b0");
  });

  it("rejects free text that merely contains a word", () => {
    expect(extractInviteIdentifier("hey are you coming to practice")).toBeNull();
    expect(extractInviteIdentifier("")).toBeNull();
    expect(extractInviteIdentifier(null)).toBeNull();
  });

  it("rejects an unrelated URL", () => {
    expect(extractInviteIdentifier("https://apps.apple.com/us/app/imuatrak/id6774396124")).toBeNull();
  });
});

describe("looksLikeInvite", () => {
  it("recognises invite links and nothing else", () => {
    expect(looksLikeInvite("https://imuatrak.app/join/hui-nalu")).toBe(true);
    expect(looksLikeInvite("imuatrak://club/join?slug=hui-nalu")).toBe(true);
    // A bare code is a valid identifier but not proof the clipboard holds an
    // invite, so it must not trigger the join screen's prefill.
    expect(looksLikeInvite("a3f9c2d8e1b0")).toBe(false);
    expect(looksLikeInvite("")).toBe(false);
  });
});
