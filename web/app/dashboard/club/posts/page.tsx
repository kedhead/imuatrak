"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { getUserClub, getClubPosts, createClubPost, deleteClubPost } from "@/lib/firebase";
import type { ClubPost, PostType, MemberRole } from "@/lib/clubTypes";

export default function PostsPage() {
  const { user, loading } = useAuth();
  const [clubId, setClubId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<MemberRole | null>(null);
  const [posts, setPosts] = useState<ClubPost[]>([]);
  const [content, setContent] = useState("");
  const [postType, setPostType] = useState<PostType>("post");
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  const isAdmin = myRole === "owner" || myRole === "admin";

  useEffect(() => {
    if (!user) return;
    getUserClub(user.uid).then((ctx) => {
      if (!ctx) return;
      setClubId(ctx.club.id);
      setMyRole(ctx.role);
      getClubPosts(ctx.club.id).then(setPosts);
    });
  }, [user]);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clubId || !user || !content.trim()) return;
    setSaving(true);
    const pinnedUntil = pinned ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : undefined;
    await createClubPost(clubId, user.uid, user.displayName ?? "Admin", { type: postType, content: content.trim(), pinnedUntil });
    const fresh = await getClubPosts(clubId);
    setPosts(fresh);
    setContent("");
    setPinned(false);
    setSaving(false);
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
          {isAdmin && (
            <div style={{ display: "flex", gap: 8 }}>
              {(["post", "announcement"] as PostType[]).map((t) => (
                <button key={t} type="button" onClick={() => setPostType(t)}
                  style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "1.5px solid", borderColor: postType === t ? "var(--blue-bright)" : "var(--line)", background: postType === t ? "var(--blue-bright)" : "transparent", color: postType === t ? "#fff" : "var(--muted)", fontWeight: 700, cursor: "pointer", fontSize: 13, textTransform: "capitalize" }}>
                  {t === "announcement" ? "📣 Announcement" : "💬 Post"}
                </button>
              ))}
            </div>
          )}
          <textarea
            required
            placeholder={postType === "announcement" ? "Write an announcement for the club…" : "Share something with the club…"}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            maxLength={2000}
            style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 15, resize: "vertical", background: "var(--bg)", color: "var(--ink)" }}
          />
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
          {pinned_posts.map((p) => <PostCard key={p.id} post={p} isAdmin={isAdmin} myUid={user?.uid} onDelete={handleDelete} />)}
        </section>
      )}

      {/* Feed */}
      <section>
        <h2 style={sectionLabel}>Feed</h2>
        {regular_posts.length > 0
          ? regular_posts.map((p) => <PostCard key={p.id} post={p} isAdmin={isAdmin} myUid={user?.uid} onDelete={handleDelete} />)
          : <div className="card" style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>No posts yet. Write the first one!</div>}
      </section>
    </main>
  );
}

function PostCard({ post, isAdmin, myUid, onDelete }: { post: ClubPost; isAdmin: boolean; myUid?: string; onDelete: (id: string) => void }) {
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
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{post.authorName}</span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{new Date(post.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          </div>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{post.content}</p>
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

const sectionLabel: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", margin: "0 0 12px" };
