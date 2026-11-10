"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/lib/auth";
import {
  deleteDmMessage,
  markDmRead,
  sendDmMessage,
  subscribeDmMessages,
  subscribeDmThreads,
  subscribeDmUnread,
  toggleDmReaction,
} from "@/lib/firebase";
import { dmThreadTitle, groupMemberSummary, type DmMessage, type DmThread } from "@/lib/clubTypes";

const REACTION_EMOJI = ["👍", "❤️", "😂", "🤙", "🔥", "😮"];

export default function DmPage() {
  const { user, loading } = useAuth();
  const [threads, setThreads] = useState<(DmThread & { id: string })[]>([]);
  const [threadsLoaded, setThreadsLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Deep link from the members list. Read off window rather than
  // useSearchParams, which forces a Suspense boundary during prerender for no
  // benefit here.
  const [requestedThread, setRequestedThread] = useState<string | null>(null);
  useEffect(() => {
    setRequestedThread(new URLSearchParams(window.location.search).get("thread"));
  }, []);

  useEffect(() => {
    if (!user) return;
    return subscribeDmThreads(user.uid, (t) => {
      setThreads(t);
      setThreadsLoaded(true);
      // Prefer the requested thread; otherwise land on the most recent rather
      // than an empty pane.
      setActiveId((cur) => cur ?? requestedThread ?? t[0]?.id ?? null);
    });
  }, [user, requestedThread]);

  useEffect(() => {
    if (!user) return;
    return subscribeDmUnread(user.uid, setUnread);
  }, [user]);

  useEffect(() => {
    if (!activeId) return;
    return subscribeDmMessages(activeId, setMessages);
  }, [activeId]);

  // Clear the badge for whichever thread is open, and re-run as messages
  // arrive so a thread read while it's on screen doesn't stay counted.
  useEffect(() => {
    if (!user || !activeId) return;
    void markDmRead(user.uid, activeId).catch(() => undefined);
  }, [user, activeId, messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, activeId]);

  const activeThread = threads.find((t) => t.id === activeId) ?? null;
  const isGroup = !!activeThread?.isGroup;
  const title = activeThread ? dmThreadTitle(activeThread, user?.uid) : "";

  const onSend = async () => {
    const content = text.trim();
    if (!content || !activeId || !user) return;
    setText("");
    setSending(true);
    try {
      await sendDmMessage(activeId, user.uid, user.displayName ?? "Member", content);
    } catch (e) {
      // Show the real error: a rules denial is the failure that matters, and
      // hiding its code makes a backend problem look like a client bug.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const onToggleReaction = (message: DmMessage, emoji: string) => {
    if (!activeId || !user) return;
    const uid = user.uid;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== message.id) return m;
        const uids = m.reactions?.[emoji] ?? [];
        const next = uids.includes(uid) ? uids.filter((u) => u !== uid) : [...uids, uid];
        return { ...m, reactions: { ...(m.reactions ?? {}), [emoji]: next } };
      }),
    );
    void toggleDmReaction(activeId, message, emoji, uid).catch(() => undefined);
  };

  const onDelete = (message: DmMessage) => {
    if (!activeId) return;
    if (!window.confirm("Delete this message? This can't be undone.")) return;
    setMessages((prev) => prev.filter((m) => m.id !== message.id));
    void deleteDmMessage(activeId, message.id).catch(() => {
      setError("Couldn't delete that message.");
    });
  };

  if (loading) return <div className="container"><p style={{ color: "var(--muted)" }}>Loading…</p></div>;
  if (!user) {
    return (
      <div className="container">
        <p>Please <Link href="/login" style={{ color: "var(--blue-bright)" }}>sign in</Link>.</p>
      </div>
    );
  }

  return (
    <main className="container">
      <h1 style={{ margin: "0 0 16px", fontSize: 28, fontWeight: 800 }}>Messages</h1>

      {error && (
        <div className="card" style={{ marginBottom: 12, borderLeft: "4px solid #ef4444", display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ wordBreak: "break-word" }}>{error}</span>
          <button onClick={() => setError(null)} style={linkBtn}>Dismiss</button>
        </div>
      )}

      {threadsLoaded && threads.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💬</div>
          <h2 style={{ margin: "0 0 8px" }}>No messages yet</h2>
          <p style={{ color: "var(--muted)", marginBottom: 24 }}>
            Start a conversation from your club&rsquo;s{" "}
            <Link href="/dashboard/club/members" style={{ color: "var(--blue-bright)" }}>
              Members
            </Link>{" "}
            list.
          </p>
        </div>
      ) : (
        <div className="dm-grid">
          {/* Thread list */}
          <div className="card" style={{ padding: 8, position: "sticky", top: 16 }}>
            {threads.map((t) => {
              const uid = t.isGroup ? "" : (t.participants.find((p) => p !== user.uid) ?? "");
              const name = dmThreadTitle(t, user.uid);
              const count = unread[t.id] ?? 0;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveId(t.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "8px 10px",
                    marginBottom: 2,
                    borderRadius: 8,
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    background: t.id === activeId ? "var(--line)" : "transparent",
                    color: "inherit",
                  }}
                >
                  {t.isGroup ? <GroupAvatar size={36} /> : (
                    <Avatar uri={t.participantAvatars?.[uid]} name={name} uid={uid} size={36} />
                  )}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: count > 0 ? 800 : 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {name}
                    </span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.lastMessagePreview || (t.isGroup ? groupMemberSummary(t, user.uid) : "No messages yet")}
                    </span>
                  </span>
                  {count > 0 && (
                    <span style={{ background: "var(--coral)", color: "#fff", borderRadius: 999, fontSize: 11, fontWeight: 800, padding: "1px 6px" }}>
                      {count > 9 ? "9+" : count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Conversation */}
          <div className="card" style={{ display: "flex", flexDirection: "column", height: "70vh", padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)" }}>
              <div style={{ fontWeight: 700 }}>{activeThread ? title : "Select a conversation"}</div>
              {activeThread && isGroup && (
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                  {activeThread.participants.length} people · {groupMemberSummary(activeThread, user.uid)} · only members can see this
                </div>
              )}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
              {activeThread && messages.length === 0 && (
                <p style={{ color: "var(--muted)", textAlign: "center", marginTop: 24 }}>
                  No messages yet. Say hi{isGroup ? "" : ` to ${title}`}.
                </p>
              )}
              {messages.map((m) => (
                <MessageRow
                  key={m.id}
                  message={m}
                  isMe={m.authorId === user.uid}
                  myUid={user.uid}
                  avatarUrl={activeThread?.participantAvatars?.[m.authorId]}
                  showName={isGroup}
                  onToggleReaction={(emoji) => onToggleReaction(m, emoji)}
                  onDelete={() => onDelete(m)}
                />
              ))}
              <div ref={bottomRef} />
            </div>

            {activeThread && (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, borderTop: "1px solid var(--line)", padding: 12 }}>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter sends; Shift+Enter is a newline, matching club chat.
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void onSend();
                    }
                  }}
                  placeholder={`Message ${title}…`}
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
            )}
          </div>
        </div>
      )}
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

function GroupAvatar({ size }: { size: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        display: "grid",
        placeItems: "center",
        background: "#2E86C1",
        color: "#fff",
      }}
    >
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4zm8 0c-.3 0-.7 0-1.1.1 1.3.9 2.1 2.2 2.1 3.9v2h7v-2c0-2.7-5.3-4-8-4z" />
      </svg>
    </span>
  );
}

function MessageRow({
  message,
  isMe,
  myUid,
  avatarUrl,
  showName,
  onToggleReaction,
  onDelete,
}: {
  message: DmMessage;
  isMe: boolean;
  myUid: string;
  avatarUrl?: string;
  /** Group chats: label whose message it is. */
  showName?: boolean;
  onToggleReaction: (emoji: string) => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const reactionEntries = Object.entries(message.reactions ?? {}).filter(([, u]) => u.length > 0);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPickerOpen(false); }}
      style={{ display: "flex", gap: 8, alignItems: "flex-end", justifyContent: isMe ? "flex-end" : "flex-start" }}
    >
      {!isMe && (
        <Avatar uri={avatarUrl} name={message.authorName} uid={message.authorId} size={28} />
      )}
      <div style={{ maxWidth: "78%", minWidth: 0, position: "relative" }}>
        {showName && !isMe && (
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", margin: "0 0 2px 4px" }}>
            {message.authorName}
          </div>
        )}
        <div
          style={{
            borderRadius: 14,
            padding: "8px 12px",
            background: isMe ? "#0E5FA5" : "var(--line)",
            color: isMe ? "#fff" : "inherit",
          }}
        >
          <div style={{ fontSize: 14, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {message.content}
          </div>
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
              zIndex: 2,
            } as React.CSSProperties}
          >
            <button onClick={() => setPickerOpen((v) => !v)} title="React" style={{ ...linkBtn, fontSize: 14 }}>😊</button>
            {/* Your own messages only — a private thread has no moderator. */}
            {isMe && (
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
