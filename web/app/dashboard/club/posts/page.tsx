"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { getUserClub, getClubPosts, createClubPost, deleteClubPost, getClubMembers, votePoll } from "@/lib/firebase";
import { POLL_MAX_OPTIONS, type ClubMember, type ClubPost, type PostType, type MemberRole } from "@/lib/clubTypes";

export default function PostsPage() {
  const { user, loading } = useAuth();
  const [clubId, setClubId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<MemberRole | null>(null);
  const [posts, setPosts] = useState<ClubPost[]>([]);
  const [content, setContent] = useState("");
  const [postType, setPostType] = useState<PostType>("post");
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<ClubMember[]>([]);
  // Poll composer
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollMulti, setPollMulti] = useState(false);
  const [pollEnds, setPollEnds] = useState("");

  const isAdmin = myRole === "owner" || myRole === "admin";
  const isStaff = isAdmin || myRole === "coach";

  useEffect(() => {
    if (!user) return;
    getUserClub(user.uid).then((ctx) => {
      if (!ctx) return;
      setClubId(ctx.club.id);
      setMyRole(ctx.role);
      getClubPosts(ctx.club.id).then(setPosts);
      getClubMembers(ctx.club.id).then(setMembers).catch(() => undefined);
    });
  }, [user]);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clubId || !user || !content.trim()) return;
    setSaving(true);
    const pinnedUntil = pinned ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : undefined;
    const options = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (postType === "poll" && options.length < 2) {
      setSaving(false);
      return alert("A poll needs at least two options.");
    }
    try {
      await createClubPost(clubId, user.uid, user.displayName ?? "Admin", {
        type: postType,
        content: content.trim(),
        pinnedUntil: postType === "announcement" ? pinnedUntil : undefined,
        ...(postType === "poll"
          ? {
              pollOptions: options.map((text) => ({ text })),
              pollMultipleChoice: pollMulti,
              // End of the chosen day, local time.
              pollEndsAt: pollEnds ? new Date(`${pollEnds}T23:59:59`).toISOString() : undefined,
            }
          : {}),
      });
      const fresh = await getClubPosts(clubId);
      setPosts(fresh);
      setContent("");
      setPinned(false);
      setPollOptions(["", ""]);
      setPollMulti(false);
      setPollEnds("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn't post.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!clubId || !confirm("Delete this post?")) return;
    await deleteClubPost(clubId, id);
    setPosts((prev) => prev.filter((p) => p.id !== id));
  };

  if (loading) return <div className="container"><p style={{ color: "var(--muted)" }}>Loading…</p></div>;

  const pinned_posts = posts.filter((p) => p.pinnedUntil && new Date(p.pinnedUntil) > new Date());
  const regular_posts = posts.filter((p) => !p.pinnedUntil || new Date(p.pinnedUntil) <= new Date());

  return (
    <main className="container">
      <div style={{ marginBottom: 24 }}>
        <Link href="/dashboard/club" style={{ color: "var(--muted)", fontSize: 13 }}>← Club Dashboard</Link>
        <h1 style={{ margin: "8px 0 0", fontSize: 28, fontWeight: 800 }}>News Feed</h1>
      </div>

      {/* Composer */}
      <div className="card" style={{ marginBottom: 24 }}>
        <form onSubmit={handlePost} style={{ display: "grid", gap: 12 }}>
          {isStaff && (
            <div style={{ display: "flex", gap: 8 }}>
              {(["post", "announcement", "poll"] as PostType[]).map((t) => (
                <button key={t} type="button" onClick={() => setPostType(t)}
                  style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "1.5px solid", borderColor: postType === t ? "var(--blue-bright)" : "var(--line)", background: postType === t ? "var(--blue-bright)" : "transparent", color: postType === t ? "#fff" : "var(--muted)", fontWeight: 700, cursor: "pointer", fontSize: 13, textTransform: "capitalize" }}>
                  {t === "announcement" ? "📣 Announcement" : t === "poll" ? "📊 Poll" : "💬 Post"}
                </button>
              ))}
            </div>
          )}
          <textarea
            required
            placeholder={
              postType === "announcement"
                ? "Write an announcement for the club…"
                : postType === "poll"
                  ? "Ask the club a question, e.g. Interested in Saturday practices in December?"
                  : "Share something with the club…"
            }
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            maxLength={2000}
            style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 15, resize: "vertical", background: "var(--bg)", color: "var(--ink)" }}
          />
          {postType === "poll" && (
            <div style={{ display: "grid", gap: 8 }}>
              {pollOptions.map((o, i) => (
                <div key={i} style={{ display: "flex", gap: 8 }}>
                  <input
                    value={o}
                    maxLength={100}
                    placeholder={`Option ${i + 1}`}
                    onChange={(e) => setPollOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                    style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 14, background: "var(--bg)", color: "var(--ink)" }}
                  />
                  {pollOptions.length > 2 && (
                    <button type="button" onClick={() => setPollOptions((prev) => prev.filter((_, j) => j !== i))}
                      style={{ background: "none", border: "1px solid var(--line)", borderRadius: 8, padding: "0 12px", color: "var(--muted)", cursor: "pointer" }}
                      aria-label={`Remove option ${i + 1}`}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {pollOptions.length < POLL_MAX_OPTIONS && (
                <button type="button" onClick={() => setPollOptions((prev) => [...prev, ""])}
                  style={{ justifySelf: "start", background: "none", border: "none", color: "var(--blue-bright)", fontWeight: 700, cursor: "pointer", padding: 0, fontSize: 14 }}>
                  + Add option
                </button>
              )}
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center", fontSize: 14, color: "var(--muted)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={pollMulti} onChange={(e) => setPollMulti(e.target.checked)} />
                  Allow multiple choices
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  Ends (optional)
                  <input type="date" value={pollEnds} onChange={(e) => setPollEnds(e.target.value)}
                    style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)" }} />
                </label>
              </div>
            </div>
          )}
          {isAdmin && postType === "announcement" && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--muted)", cursor: "pointer" }}>
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              Pin for 30 days
            </label>
          )}
          <button type="submit" disabled={saving || !content.trim()}
            style={{ background: "var(--blue-bright)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 0", fontWeight: 700, cursor: "pointer", fontSize: 15, opacity: !content.trim() ? 0.5 : 1 }}>
            {saving ? "Posting…" : "Post"}
          </button>
        </form>
      </div>

      {/* Pinned announcements */}
      {pinned_posts.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={sectionLabel}>📌 Pinned</h2>
          {pinned_posts.map((p) => <PostCard key={p.id} post={p} isAdmin={isAdmin} isStaff={isStaff} myUid={user?.uid} clubId={clubId} members={members} onDelete={handleDelete} />)}
        </section>
      )}

      {/* Feed */}
      <section>
        <h2 style={sectionLabel}>Feed</h2>
        {regular_posts.length > 0
          ? regular_posts.map((p) => <PostCard key={p.id} post={p} isAdmin={isAdmin} isStaff={isStaff} myUid={user?.uid} clubId={clubId} members={members} onDelete={handleDelete} />)
          : <div className="card" style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>No posts yet. Write the first one!</div>}
      </section>
    </main>
  );
}

function PostCard({
  post,
  isAdmin,
  isStaff,
  myUid,
  clubId,
  members,
  onDelete,
}: {
  post: ClubPost;
  isAdmin: boolean;
  isStaff: boolean;
  myUid?: string;
  clubId: string | null;
  members: ClubMember[];
  onDelete: (id: string) => void;
}) {
  const canDelete = isAdmin || post.authorId === myUid;
  const isAnnouncement = post.type === "announcement";
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      {isAnnouncement && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--blue-bright)", letterSpacing: 0.5 }}>📣 ANNOUNCEMENT</span>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        {/* minWidth: 0 lets this flex child shrink below its content width —
            without it a long unbroken URL blows the card open sideways. */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{post.authorName}</span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{new Date(post.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          </div>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            <Linkify text={post.content} />
          </p>
          {post.type === "poll" && clubId && (
            <PollBlock post={post} clubId={clubId} myUid={myUid} isStaff={isStaff} members={members} />
          )}
          {post.commentCount > 0 && (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--muted)" }}>{post.commentCount} comment{post.commentCount !== 1 ? "s" : ""}</p>
          )}
        </div>
        {canDelete && (
          <button onClick={() => onDelete(post.id)} style={{ fontSize: 12, color: "#ef4444", background: "none", border: "1px solid #ef4444", borderRadius: 6, padding: "4px 10px", cursor: "pointer", flexShrink: 0 }}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A feed poll: vote (any member), live percentages, and for staff a "See who
 * voted" list per option plus who hasn't voted. Votes are stored by uid on
 * the post (pollVotes), the same as the app.
 */
function PollBlock({
  post,
  clubId,
  myUid,
  isStaff,
  members,
}: {
  post: ClubPost;
  clubId: string;
  myUid?: string;
  isStaff: boolean;
  members: ClubMember[];
}) {
  const [votes, setVotes] = useState<Record<string, string[]>>(post.pollVotes ?? {});
  const [busy, setBusy] = useState(false);
  const [showVoters, setShowVoters] = useState(false);
  const options = post.pollOptions ?? [];
  const multi = post.pollMultipleChoice ?? false;
  const closed = post.pollEndsAt ? new Date(post.pollEndsAt) < new Date() : false;
  const total = Object.values(votes).reduce((n, v) => n + v.length, 0);

  const vote = async (i: number) => {
    if (!myUid || closed || busy) return;
    const key = String(i);
    const before = votes;
    // Optimistic, mirroring the write.
    const next: Record<string, string[]> = {};
    options.forEach((_, j) => {
      const k = String(j);
      const list = (before[k] ?? []).filter((u) => u !== myUid);
      const had = (before[k] ?? []).includes(myUid);
      if (k === key) next[k] = had ? list : [...list, myUid];
      else next[k] = multi && had ? [...list, myUid] : list;
    });
    setVotes(next);
    setBusy(true);
    try {
      await votePoll(clubId, post.id, myUid, i, before, multi);
    } catch {
      setVotes(before);
      alert("Couldn't save your vote.");
    } finally {
      setBusy(false);
    }
  };

  const byUid = new Map(members.map((m) => [m.uid, m]));
  const voted = new Set(Object.values(votes).flat());
  const notVoted = members.filter((m) => !voted.has(m.uid)).sort((a, b) => a.displayName.localeCompare(b.displayName));
  const names = (uids: string[]) => {
    const known = uids.map((u) => byUid.get(u)?.displayName).filter((n): n is string => !!n).sort();
    const gone = uids.length - known.length;
    return known.join(", ") + (gone > 0 ? `${known.length ? ", " : ""}+${gone} who left the club` : "");
  };

  return (
    <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
      {options.map((opt, i) => {
        const list = votes[String(i)] ?? [];
        const pct = total > 0 ? Math.round((list.length / total) * 100) : 0;
        const mine = !!myUid && list.includes(myUid);
        return (
          <button
            key={i}
            type="button"
            onClick={() => void vote(i)}
            disabled={!myUid || closed || busy}
            style={{
              position: "relative",
              overflow: "hidden",
              textAlign: "left",
              padding: "10px 14px",
              borderRadius: 10,
              border: `1.5px solid ${mine ? "var(--blue-bright)" : "var(--line)"}`,
              background: "var(--bg)",
              color: "var(--ink)",
              cursor: closed ? "default" : "pointer",
              font: "inherit",
            }}
          >
            <span style={{ position: "absolute", inset: 0, width: `${pct}%`, background: "color-mix(in srgb, var(--blue-bright) 16%, transparent)" }} />
            <span style={{ position: "relative", display: "flex", justifyContent: "space-between", gap: 12, fontWeight: mine ? 700 : 500 }}>
              <span>{mine ? "✓ " : ""}{opt.text}</span>
              <span style={{ color: "var(--muted)", fontWeight: 700 }}>{total > 0 ? `${pct}%` : ""}</span>
            </span>
          </button>
        );
      })}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 12, color: "var(--muted)" }}>
        <span>
          {total} vote{total !== 1 ? "s" : ""}
          {multi ? " · Multiple choice" : ""}
          {closed ? " · Closed" : post.pollEndsAt ? ` · Ends ${new Date(post.pollEndsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}
        </span>
        {isStaff && (
          <button type="button" onClick={() => setShowVoters((v) => !v)}
            style={{ background: "none", border: "none", color: "var(--blue-bright)", fontWeight: 700, cursor: "pointer", padding: 0, fontSize: 13 }}>
            {showVoters ? "Hide voters" : "👥 See who voted"}
          </button>
        )}
      </div>
      {isStaff && showVoters && (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "grid", gap: 10, fontSize: 14 }}>
          {options.map((opt, i) => {
            const list = votes[String(i)] ?? [];
            return (
              <div key={i}>
                <div style={{ fontWeight: 700 }}>{opt.text} <span style={{ color: "var(--muted)" }}>· {list.length}</span></div>
                <div style={{ color: list.length ? "var(--ink)" : "var(--muted)" }}>{list.length ? names(list) : "No votes yet"}</div>
              </div>
            );
          })}
          <div>
            <div style={{ fontWeight: 700, color: "var(--muted)" }}>Haven&apos;t voted · {notVoted.length}</div>
            <div style={{ color: notVoted.length ? "var(--ink)" : "var(--muted)" }}>
              {notVoted.length ? notVoted.map((m) => m.displayName).join(", ") : "Everyone has voted 🎉"}
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Only coaches and admins can see this.</div>
        </div>
      )}
    </div>
  );
}

/** Renders http(s) URLs in post text as clickable links. */
function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/gi);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//i.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue-bright)", wordBreak: "break-all" }}>
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

const sectionLabel: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", margin: "0 0 12px" };
