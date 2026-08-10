"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/lib/auth";
import {
  deleteChannelMessage,
  getClubMembers,
  getUserClub,
  markChannelRead,
  sendChannelMessage,
  subscribeChannelMessages,
  subscribeChannels,
  toggleMessageReaction,
  uploadChannelMedia,
} from "@/lib/firebase";
import {
  applyMention,
  findMentionSpans,
  matchMentionCandidates,
  mentionQueryAt,
  resolveMentions,
  type MentionTarget,
} from "@/lib/mentions";
import type { Club, ClubChannel, ClubMember, ClubMessage, MemberRole } from "@/lib/clubTypes";

const REACTION_EMOJI = ["👍", "❤️", "😂", "🤙", "🔥", "😮"];

// Matches the app's chat roles: members stay unstyled so the feed reads clean.
const ROLE_META: Record<MemberRole, { label: string; color: string; bubbleBg: string } | null> = {
  owner: { label: "OWNER", color: "#FFC24B", bubbleBg: "#FFF7E6" },
  admin: { label: "ADMIN", color: "#FF6B5E", bubbleBg: "#FFF0EE" },
  coach: { label: "COACH", color: "#1FB6A6", bubbleBg: "#E9F9F6" },
  member: null,
};

const IMAGE_LINK = /https?:\/\/\S+\.(?:png|jpe?g|gif|webp)(?:\?\S*)?/gi;
const ANY_LINK = /(https?:\/\/\S+)/g;

export default function ClubChatPage() {
  const { user, loading } = useAuth();
  const [club, setClub] = useState<Club | null | "none">(null);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [channels, setChannels] = useState<ClubChannel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ClubMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<NonNullable<ClubMessage["replyTo"]> | null>(null);
  const [viewer, setViewer] = useState<{ urls: string[]; index: number } | null>(null);
  const [caret, setCaret] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    void getUserClub(user.uid).then((r) => {
      setClub(r?.club ?? "none");
      if (r) void getClubMembers(r.club.id).then(setMembers);
    });
  }, [user]);

  const clubId = club && club !== "none" ? club.id : null;

  useEffect(() => {
    if (!clubId || !user) return;
    return subscribeChannels(clubId, user.uid, (list) => {
      setChannels(list);
      // Land in the first channel rather than an empty pane on first load.
      setActiveId((cur) => cur ?? list[0]?.id ?? null);
    });
  }, [clubId, user]);

  useEffect(() => {
    if (!clubId || !activeId) return;
    return subscribeChannelMessages(clubId, activeId, setMessages);
  }, [clubId, activeId]);

  useEffect(() => {
    if (!user || !activeId) return;
    void markChannelRead(user.uid, activeId).catch(() => undefined);
  }, [user, activeId]);

  // Follow the conversation as it grows, the way the app's inverted list does.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, activeId]);

  const activeChannel = channels.find((c) => c.id === activeId) ?? null;

  const roleByUid = useMemo(() => {
    const map = new Map<string, MemberRole>();
    for (const m of members) map.set(m.uid, m.role);
    return map;
  }, [members]);

  // Avatars resolve from the roster by authorId rather than a copy on the
  // message, so changing a photo updates a member's whole history.
  const avatarByUid = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) if (m.avatarUrl) map.set(m.uid, m.avatarUrl);
    return map;
  }, [members]);

  const myRole = user ? roleByUid.get(user.uid) : undefined;
  const canModerate = myRole === "owner" || myRole === "admin";

  // Who can be @-mentioned: everyone for a public channel, only its members
  // for a private one — mentioning someone who can't read it is meaningless.
  const mentionTargets = useMemo<MentionTarget[]>(() => {
    const allowed = activeChannel?.isPrivate
      ? members.filter((m) => activeChannel.memberIds?.includes(m.uid))
      : members;
    return allowed.map((m) => ({ uid: m.uid, name: m.displayName }));
  }, [members, activeChannel]);

  const mentionQuery = mentionQueryAt(text, Math.min(caret, text.length));
  const mentionCandidates = mentionQuery
    ? matchMentionCandidates(mentionQuery.query, mentionTargets).slice(0, 6)
    : null;

  const onPickMention = useCallback(
    (target: MentionTarget) => {
      if (!mentionQuery) return;
      const { text: next, cursor: nextCaret } = applyMention(
        text,
        mentionQuery.start,
        caret,
        target.name,
      );
      setText(next);
      setCaret(nextCaret);
      // Restore focus and put the caret after the inserted name.
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(nextCaret, nextCaret);
      });
    },
    [mentionQuery, text, caret],
  );

  const previewOf = (m: ClubMessage): string =>
    m.content.trim().length > 0
      ? m.content.trim().slice(0, 80)
      : m.mediaType === "video"
        ? "Video"
        : "Photo";

  const onSend = async () => {
    const content = text.trim();
    if (!content || !clubId || !activeId || !user) return;
    const replyTo = replyTarget ?? undefined;
    const mentions = resolveMentions(content, mentionTargets);
    setText("");
    setReplyTarget(null);
    setSending(true);
    try {
      await sendChannelMessage(
        clubId,
        activeId,
        user.uid,
        user.displayName ?? "Member",
        content,
        { replyTo, mentions },
      );
    } catch {
      setError("Couldn't send that message.");
    } finally {
      setSending(false);
    }
  };

  const onToggleReaction = (message: ClubMessage, emoji: string) => {
    if (!clubId || !activeId || !user) return;
    const uid = user.uid;
    // Optimistic flip; the snapshot listener reconciles with the server.
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== message.id) return m;
        const uids = m.reactions?.[emoji] ?? [];
        const next = uids.includes(uid) ? uids.filter((u) => u !== uid) : [...uids, uid];
        return { ...m, reactions: { ...(m.reactions ?? {}), [emoji]: next } };
      }),
    );
    void toggleMessageReaction(clubId, activeId, message, emoji, uid).catch(() => undefined);
  };

  const onDelete = (message: ClubMessage) => {
    if (!clubId || !activeId) return;
    if (!window.confirm("Delete this message? This can't be undone.")) return;
    setMessages((prev) => prev.filter((m) => m.id !== message.id));
    void deleteChannelMessage(clubId, activeId, message.id).catch(() => {
      setError("Couldn't delete that message.");
    });
  };

  const onPickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !clubId || !activeId || !user) return;
    const name = user.displayName ?? "Member";
    const chosen = Array.from(files).slice(0, 8);
    const videos = chosen.filter((f) => f.type.startsWith("video/"));
    const images = chosen.filter((f) => f.type.startsWith("image/"));

    try {
      // Each video is its own message, matching the app's single-attachment flow.
      for (const v of videos) {
        const msg = await sendChannelMessage(clubId, activeId, user.uid, name, "", {
          mediaType: "video",
        });
        setUploadingId(msg.id);
        await uploadChannelMedia(clubId, activeId, msg.id, v);
      }

      if (images.length === 1) {
        const msg = await sendChannelMessage(clubId, activeId, user.uid, name, "", {
          mediaType: "photo",
        });
        setUploadingId(msg.id);
        await uploadChannelMedia(clubId, activeId, msg.id, images[0]!);
      } else if (images.length > 1) {
        // One message carrying every image — rendered as a grid.
        const msg = await sendChannelMessage(clubId, activeId, user.uid, name, "", {
          mediaType: "photo",
        });
        setUploadingId(msg.id);
        for (let i = 0; i < images.length; i++) {
          await uploadChannelMedia(clubId, activeId, msg.id, images[i]!, `media-${i}`);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploadingId(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (loading || club === null) {
    return <div className="container"><p style={{ color: "var(--muted)" }}>Loading…</p></div>;
  }
  if (!user) {
    return (
      <div className="container">
        <p>Please <Link href="/login" style={{ color: "var(--blue-bright)" }}>sign in</Link>.</p>
      </div>
    );
  }
  if (club === "none") {
    return (
      <main className="container">
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💬</div>
          <h2 style={{ margin: "0 0 8px" }}>No club yet</h2>
          <p style={{ color: "var(--muted)", marginBottom: 24 }}>
            Join a club from the mobile app to chat here.
          </p>
          <Link href="/dashboard" style={{ color: "var(--blue-bright)" }}>← Back to sessions</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <div style={{ marginBottom: 16 }}>
        <Link href="/dashboard/club" style={{ color: "var(--blue-bright)", fontSize: 14, textDecoration: "none" }}>
          ← {club.name}
        </Link>
        <h1 style={{ margin: "6px 0 0", fontSize: 28, fontWeight: 800 }}>Chat</h1>
      </div>

      {error && (
        <div
          className="card"
          style={{ marginBottom: 12, borderLeft: "4px solid #ef4444", display: "flex", justifyContent: "space-between", gap: 12 }}
        >
          <span>{error}</span>
          <button onClick={() => setError(null)} style={linkBtn}>Dismiss</button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 220px) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        {/* Channel list */}
        <div className="card" style={{ padding: 8, position: "sticky", top: 16 }}>
          {channels.length === 0 && (
            <p style={{ color: "var(--muted)", fontSize: 13, padding: 8, margin: 0 }}>No channels.</p>
          )}
          {channels.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 10px",
                marginBottom: 2,
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                background: c.id === activeId ? "var(--line)" : "transparent",
                fontWeight: c.id === activeId ? 700 : 500,
                color: "inherit",
                fontSize: 14,
              }}
            >
              <span aria-hidden>{c.iconType === "emoji" ? c.icon : "#"}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.name}
              </span>
              {c.isPrivate && <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>🔒</span>}
            </button>
          ))}
        </div>

        {/* Message pane */}
        <div className="card" style={{ display: "flex", flexDirection: "column", height: "70vh", padding: 0, overflow: "hidden" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
            {messages.length === 0 && (
              <p style={{ color: "var(--muted)", textAlign: "center", marginTop: 24 }}>
                No messages yet. Say hi!
              </p>
            )}
            {messages.map((m) => (
              <MessageRow
                key={m.id}
                message={m}
                isMe={m.authorId === user.uid}
                role={roleByUid.get(m.authorId)}
                avatarUrl={avatarByUid.get(m.authorId)}
                myUid={user.uid}
                uploading={uploadingId === m.id}
                mentionTargets={mentionTargets}
                canDelete={m.authorId === user.uid || canModerate}
                onReply={() =>
                  setReplyTarget({ messageId: m.id, authorName: m.authorName, preview: previewOf(m) })
                }
                onDelete={() => onDelete(m)}
                onToggleReaction={(emoji) => onToggleReaction(m, emoji)}
                onOpenViewer={(urls, index) => setViewer({ urls, index })}
              />
            ))}
            <div ref={bottomRef} />
          </div>

          {replyTarget && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderTop: "1px solid var(--line)", background: "var(--bg-soft, transparent)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--blue-bright)" }}>
                  Replying to {replyTarget.authorName}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {replyTarget.preview}
                </div>
              </div>
              <button onClick={() => setReplyTarget(null)} style={linkBtn}>✕</button>
            </div>
          )}

          {/* Composer */}
          <div style={{ position: "relative", borderTop: "1px solid var(--line)", padding: 12 }}>
            {mentionCandidates && mentionCandidates.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  bottom: "100%",
                  left: 12,
                  right: 12,
                  marginBottom: 4,
                  background: "var(--card, #fff)",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  overflow: "hidden",
                  zIndex: 5,
                  boxShadow: "0 6px 20px rgba(0,0,0,.12)",
                }}
              >
                {mentionCandidates.map((t) => (
                  <button
                    key={t.uid}
                    onMouseDown={(e) => {
                      // mousedown, not click: the textarea blurring first would
                      // close the picker before the selection registered.
                      e.preventDefault();
                      onPickMention(t);
                    }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", color: "inherit" }}
                  >
                    <Avatar uri={avatarByUid.get(t.uid)} name={t.name} uid={t.uid} role={roleByUid.get(t.uid)} size={24} />
                    <span style={{ fontSize: 14 }}>{t.name}</span>
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={(e) => void onPickFiles(e.target.files)}
                style={{ display: "none" }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                title="Attach photos or video"
                style={{ ...linkBtn, fontSize: 20, lineHeight: 1, padding: "6px 4px" }}
              >
                🖼️
              </button>
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setCaret(e.target.selectionStart ?? e.target.value.length);
                }}
                onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
                onKeyDown={(e) => {
                  // Enter sends; Shift+Enter is a newline, as in most chat apps.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void onSend();
                  }
                }}
                placeholder={activeChannel ? `Message ${activeChannel.name}…` : "Message…"}
                rows={1}
                maxLength={1000}
                style={{
                  flex: 1,
                  resize: "none",
                  minHeight: 38,
                  maxHeight: 120,
                  padding: "9px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--line)",
                  background: "transparent",
                  color: "inherit",
                  font: "inherit",
                  fontSize: 14,
                }}
              />
              <button
                onClick={() => void onSend()}
                disabled={sending || !text.trim()}
                style={{
                  padding: "9px 16px",
                  borderRadius: 10,
                  border: "none",
                  background: !text.trim() || sending ? "var(--line)" : "var(--blue-bright)",
                  color: !text.trim() || sending ? "var(--muted)" : "#fff",
                  fontWeight: 700,
                  cursor: !text.trim() || sending ? "default" : "pointer",
                  fontSize: 14,
                }}
              >
                {sending ? "…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {viewer && <Lightbox urls={viewer.urls} index={viewer.index} onClose={() => setViewer(null)} />}
    </main>
  );
}

const linkBtn: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--muted)",
  cursor: "pointer",
  fontSize: 13,
  padding: 0,
};

function MessageRow({
  message,
  isMe,
  role,
  avatarUrl,
  myUid,
  uploading,
  mentionTargets,
  canDelete,
  onReply,
  onDelete,
  onToggleReaction,
  onOpenViewer,
}: {
  message: ClubMessage;
  isMe: boolean;
  role?: MemberRole;
  avatarUrl?: string;
  myUid: string;
  uploading: boolean;
  mentionTargets: MentionTarget[];
  canDelete: boolean;
  onReply: () => void;
  onDelete: () => void;
  onToggleReaction: (emoji: string) => void;
  onOpenViewer: (urls: string[], index: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const roleMeta = role ? ROLE_META[role] : null;
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  const linkedImages: string[] = message.content.match(IMAGE_LINK) ?? [];
  const imageOnly = linkedImages.length === 1 && message.content.trim() === linkedImages[0];

  const photoUrls =
    message.mediaUrls && message.mediaUrls.length > 0
      ? message.mediaUrls
      : message.mediaType === "photo" && message.mediaUrl
        ? [message.mediaUrl]
        : [];

  const reactionEntries = Object.entries(message.reactions ?? {}).filter(([, u]) => u.length > 0);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPickerOpen(false); }}
      style={{ display: "flex", gap: 8, alignItems: "flex-end", justifyContent: isMe ? "flex-end" : "flex-start" }}
    >
      {!isMe && (
        <Avatar uri={avatarUrl} name={message.authorName} uid={message.authorId} role={role} size={32} />
      )}

      <div style={{ maxWidth: "78%", minWidth: 0, position: "relative" }}>
        <div
          style={{
            borderRadius: 14,
            padding: "8px 12px",
            background: isMe ? "#0E5FA5" : roleMeta ? roleMeta.bubbleBg : "var(--line)",
            color: isMe ? "#fff" : "inherit",
            borderLeft: !isMe && roleMeta ? `3px solid ${roleMeta.color}` : undefined,
          }}
        >
          {!isMe && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: roleMeta?.color ?? "var(--muted)" }}>
                {message.authorName}
              </span>
              {roleMeta && (
                <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", background: roleMeta.color, borderRadius: 4, padding: "1px 4px" }}>
                  {roleMeta.label}
                </span>
              )}
            </div>
          )}

          {message.replyTo && (
            <div style={{ borderLeft: "3px solid rgba(127,127,127,.5)", paddingLeft: 8, marginBottom: 6, opacity: 0.85 }}>
              <div style={{ fontSize: 11, fontWeight: 700 }}>{message.replyTo.authorName}</div>
              <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {message.replyTo.preview}
              </div>
            </div>
          )}

          {photoUrls.length > 0 && (
            <MediaGrid urls={photoUrls} uploading={uploading} onOpen={(i) => onOpenViewer(photoUrls, i)} />
          )}

          {message.mediaType === "video" && message.mediaUrl && (
            <video src={message.mediaUrl} controls style={{ maxWidth: "100%", borderRadius: 10, marginTop: photoUrls.length ? 6 : 0 }} />
          )}

          {uploading && photoUrls.length === 0 && (
            <div style={{ fontSize: 12, opacity: 0.8 }}>Uploading…</div>
          )}

          {!imageOnly && message.content.trim().length > 0 && (
            <div style={{ fontSize: 14, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              <RichText
                text={message.content}
                mentionTargets={mentionTargets}
                myUid={myUid}
                isMe={isMe}
              />
            </div>
          )}

          {linkedImages.map((url, idx) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${url}-${idx}`}
              src={url}
              alt=""
              onClick={() => onOpenViewer(linkedImages, idx)}
              style={{ maxWidth: "100%", borderRadius: 10, marginTop: 6, cursor: "pointer", display: "block" }}
            />
          ))}

          <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: "right" }}>{time}</div>
        </div>

        {reactionEntries.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3, justifyContent: isMe ? "flex-end" : "flex-start" }}>
            {reactionEntries.map(([emoji, uids]) => (
              <button
                key={emoji}
                onClick={() => onToggleReaction(emoji)}
                style={{
                  border: uids.includes(myUid) ? "1px solid var(--blue-bright)" : "1px solid var(--line)",
                  background: "var(--card, transparent)",
                  borderRadius: 999,
                  padding: "1px 7px",
                  fontSize: 12,
                  cursor: "pointer",
                  color: "inherit",
                }}
              >
                {emoji} {uids.length}
              </button>
            ))}
          </div>
        )}

        {/* Hover actions — the web stand-in for the app's long-press sheet */}
        {hovered && (
          <div
            style={{
              position: "absolute",
              top: -12,
              [isMe ? "left" : "right"]: -6,
              display: "flex",
              gap: 2,
              background: "var(--card, #fff)",
              border: "1px solid var(--line)",
              borderRadius: 999,
              padding: "2px 4px",
              boxShadow: "0 2px 8px rgba(0,0,0,.1)",
              zIndex: 2,
            } as React.CSSProperties}
          >
            <button onClick={() => setPickerOpen((v) => !v)} title="React" style={{ ...linkBtn, fontSize: 14 }}>😊</button>
            <button onClick={onReply} title="Reply" style={{ ...linkBtn, fontSize: 14 }}>↩︎</button>
            {canDelete && (
              <button onClick={onDelete} title="Delete" style={{ ...linkBtn, fontSize: 14 }}>🗑️</button>
            )}
          </div>
        )}

        {pickerOpen && (
          <div
            style={{
              position: "absolute",
              top: -44,
              [isMe ? "left" : "right"]: -6,
              display: "flex",
              gap: 2,
              background: "var(--card, #fff)",
              border: "1px solid var(--line)",
              borderRadius: 999,
              padding: "4px 6px",
              boxShadow: "0 2px 8px rgba(0,0,0,.15)",
              zIndex: 3,
            } as React.CSSProperties}
          >
            {REACTION_EMOJI.map((e) => (
              <button
                key={e}
                onClick={() => { onToggleReaction(e); setPickerOpen(false); }}
                style={{ ...linkBtn, fontSize: 16 }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Highlights @-mentions, and turns bare URLs into links. */
function RichText({
  text,
  mentionTargets,
  myUid,
  isMe,
}: {
  text: string;
  mentionTargets: MentionTarget[];
  myUid: string;
  isMe: boolean;
}) {
  const spans = findMentionSpans(text, mentionTargets);
  const pieces: React.ReactNode[] = [];
  let cursor = 0;

  spans.forEach((span, i) => {
    if (span.start > cursor) {
      pieces.push(<Linkified key={`t${i}`} text={text.slice(cursor, span.start)} isMe={isMe} />);
    }
    pieces.push(
      <span
        key={`m${i}`}
        style={{
          fontWeight: 700,
          // Being mentioned yourself is worth spotting at a glance.
          background: span.uid === myUid ? "rgba(255,194,75,.35)" : "transparent",
          color: isMe ? "#cfe6ff" : "var(--blue-bright)",
          borderRadius: 3,
        }}
      >
        {text.slice(span.start, span.end)}
      </span>,
    );
    cursor = span.end;
  });

  if (cursor < text.length) {
    pieces.push(<Linkified key="tail" text={text.slice(cursor)} isMe={isMe} />);
  }
  return <>{pieces}</>;
}

function Linkified({ text, isMe }: { text: string; isMe: boolean }) {
  const parts = text.split(ANY_LINK);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: isMe ? "#cfe6ff" : "var(--blue-bright)", wordBreak: "break-all" }}
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function MediaGrid({
  urls,
  uploading,
  onOpen,
}: {
  urls: string[];
  uploading: boolean;
  onOpen: (index: number) => void;
}) {
  const columns = urls.length === 1 ? 1 : 2;
  return (
    <div style={{ position: "relative", marginBottom: 4 }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 3, borderRadius: 10, overflow: "hidden" }}>
        {urls.map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${url}-${i}`}
            src={url}
            alt=""
            onClick={() => onOpen(i)}
            style={{
              width: "100%",
              aspectRatio: urls.length === 1 ? undefined : "1 / 1",
              maxHeight: urls.length === 1 ? 320 : undefined,
              objectFit: "cover",
              cursor: "pointer",
              display: "block",
            }}
          />
        ))}
      </div>
      {uploading && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,.35)", borderRadius: 10, color: "#fff", fontSize: 13 }}>
          Uploading…
        </div>
      )}
    </div>
  );
}

function Lightbox({ urls, index, onClose }: { urls: string[]; index: number; onClose: () => void }) {
  const [i, setI] = useState(index);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((v) => Math.min(v + 1, urls.length - 1));
      if (e.key === "ArrowLeft") setI((v) => Math.max(v - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, urls.length]);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.9)", display: "grid", placeItems: "center", zIndex: 50 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={urls[i] ?? ""} alt="" style={{ maxWidth: "92vw", maxHeight: "88vh", objectFit: "contain" }} />
      {urls.length > 1 && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ position: "absolute", bottom: 24, display: "flex", gap: 12, alignItems: "center", color: "#fff" }}
        >
          <button onClick={() => setI((v) => Math.max(v - 1, 0))} disabled={i === 0} style={{ ...linkBtn, color: "#fff", fontSize: 22 }}>‹</button>
          <span style={{ fontSize: 13 }}>{i + 1} / {urls.length}</span>
          <button onClick={() => setI((v) => Math.min(v + 1, urls.length - 1))} disabled={i === urls.length - 1} style={{ ...linkBtn, color: "#fff", fontSize: 22 }}>›</button>
        </div>
      )}
      <button onClick={onClose} style={{ position: "absolute", top: 16, right: 20, ...linkBtn, color: "#fff", fontSize: 26 }}>✕</button>
    </div>
  );
}
