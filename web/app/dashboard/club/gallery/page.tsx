"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/lib/auth";
import {
  addPostComment,
  createPhotoPost,
  deleteClubPostWithMedia,
  getClubMembers,
  getGalleryPosts,
  getPostComments,
  getUserClub,
  togglePostLike,
  uploadPostMedia,
} from "@/lib/firebase";
import { hashtagRegex } from "@/lib/clubTypes";
import type { Club, ClubMember, ClubPost, MemberRole } from "@/lib/clubTypes";

type Comment = { id: string; content: string; authorId: string; authorName: string; createdAt: string };
type Tile = { post: ClubPost; url: string };
type Layout = "feed" | "grid";

/**
 * Club photo gallery.
 *
 * Photo posts share the posts collection with Team Updates, so likes and
 * comments reuse the post plumbing — see the PostType comment in
 * src/models/club.ts.
 */
export default function GalleryPage() {
  const { user, loading } = useAuth();
  const [club, setClub] = useState<Club | null | "none">(null);
  const [role, setRole] = useState<MemberRole | null>(null);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [posts, setPosts] = useState<ClubPost[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [layout, setLayout] = useState<Layout>("feed");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [draft, setDraft] = useState<File[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const clubId = club && club !== "none" ? club.id : null;
  const isStaff = role === "owner" || role === "admin";

  // Keyed on user.uid, not the user object: onAuthStateChanged can emit a new
  // User instance for the same account, and depending on the object re-ran the
  // club lookup and a full member-roster read every time it did.
  const uid = user?.uid;

  useEffect(() => {
    if (!uid) return;
    void getUserClub(uid).then((r) => {
      setClub(r?.club ?? "none");
      setRole(r?.role ?? null);
      if (r) void getClubMembers(r.club.id).then(setMembers);
    });
  }, [uid]);

  const load = useCallback(async () => {
    if (!clubId) return;
    try {
      setPosts(await getGalleryPosts(clubId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoaded(true);
    }
  }, [clubId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onPickFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const images = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, 8);
    if (fileRef.current) fileRef.current.value = "";
    if (images.length > 0) setDraft(images);
  };

  const onPost = async (images: File[], caption: string, taggedUids: string[]) => {
    if (!clubId || !user) return;
    setDraft(null);
    setUploading(true);
    try {
      const postId = await createPhotoPost(
        clubId,
        user.uid,
        user.displayName ?? "Member",
        caption.trim(),
        taggedUids,
      );
      for (let i = 0; i < images.length; i++) {
        await uploadPostMedia(
          clubId,
          postId,
          images[i]!,
          images.length === 1 ? "media" : `media-${i}`,
        );
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  /** Every tag in use, most-used first, for the filter row. */
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of posts) for (const t of p.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [posts]);

  const visiblePosts = useMemo(
    () => (activeTag ? posts.filter((p) => (p.tags ?? []).includes(activeTag)) : posts),
    [posts, activeTag],
  );

  // One tile per photo, not per post — a post carrying four pictures should
  // read as four tiles.
  const tiles: Tile[] = useMemo(
    () => visiblePosts.flatMap((post) => (post.mediaUrls ?? []).map((url) => ({ post, url }))),
    [visiblePosts],
  );

  const nameFor = useCallback(
    (uid: string) => members.find((m) => m.uid === uid)?.displayName,
    [members],
  );
  const avatarFor = useCallback(
    (uid: string) => members.find((m) => m.uid === uid)?.avatarUrl,
    [members],
  );

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
          <div style={{ fontSize: 48, marginBottom: 16 }}>📷</div>
          <h2 style={{ margin: "0 0 8px" }}>No club yet</h2>
          <p style={{ color: "var(--muted)" }}>Join a club from the mobile app to see its gallery.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <Link href="/dashboard/club" style={{ color: "var(--blue-bright)", fontSize: 14, textDecoration: "none" }}>
            ← {club.name}
          </Link>
          <h1 style={{ margin: "6px 0 0", fontSize: 28, fontWeight: 800 }}>Gallery</h1>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => onPickFiles(e.target.files)}
          style={{ display: "none" }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{
            padding: "10px 20px",
            borderRadius: 10,
            border: "none",
            background: uploading ? "var(--line)" : "var(--blue-bright)",
            color: uploading ? "var(--muted)" : "#fff",
            fontWeight: 700,
            cursor: uploading ? "default" : "pointer",
            fontSize: 14,
          }}
        >
          {uploading ? "Uploading…" : "Add photos"}
        </button>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 12, borderLeft: "4px solid #ef4444", display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ wordBreak: "break-word" }}>{error}</span>
          <button onClick={() => setError(null)} style={linkBtn}>Dismiss</button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <TagChip label="All" on={!activeTag} onClick={() => setActiveTag(null)} />
        {allTags.map((t) => (
          <TagChip
            key={t}
            label={`#${t}`}
            on={activeTag === t}
            onClick={() => setActiveTag(activeTag === t ? null : t)}
          />
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <TagChip label="Feed" on={layout === "feed"} onClick={() => setLayout("feed")} />
          <TagChip label="Grid" on={layout === "grid"} onClick={() => setLayout("grid")} />
        </div>
      </div>

      {loaded && tiles.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📷</div>
          <h2 style={{ margin: "0 0 8px" }}>
            {activeTag ? "Nothing tagged that" : "No photos yet"}
          </h2>
          <p style={{ color: "var(--muted)" }}>
            {activeTag
              ? `No photos are tagged #${activeTag} yet.`
              : "Post the first one — race day, practice, whatever the crew got up to."}
          </p>
        </div>
      ) : layout === "grid" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 4 }}>
          {tiles.map((t, i) => (
            <button
              key={`${t.post.id}-${i}`}
              onClick={() => setOpenIndex(i)}
              style={{ border: "none", padding: 0, background: "none", cursor: "pointer", aspectRatio: "1 / 1", overflow: "hidden" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 20, maxWidth: 560, margin: "0 auto" }}>
          {visiblePosts.map((post) => (
            <PhotoCard
              key={post.id}
              post={post}
              clubId={club.id}
              myUid={user.uid}
              canDelete={post.authorId === user.uid || isStaff}
              authorAvatar={avatarFor(post.authorId)}
              taggedNames={(post.taggedUids ?? [])
                .map(nameFor)
                .filter((n): n is string => !!n)}
              onOpen={(url) => {
                const at = tiles.findIndex((t) => t.post.id === post.id && t.url === url);
                if (at >= 0) setOpenIndex(at);
              }}
              onTagClick={setActiveTag}
              onDeleted={load}
            />
          ))}
        </div>
      )}

      {draft && (
        <ComposeDialog
          files={draft}
          members={members.filter((m) => m.uid !== user.uid)}
          onCancel={() => setDraft(null)}
          onPost={onPost}
        />
      )}

      {openIndex !== null && tiles[openIndex] && (
        <PhotoViewer
          tiles={tiles}
          index={openIndex}
          clubId={club.id}
          myUid={user.uid}
          myName={user.displayName ?? "Member"}
          isStaff={isStaff}
          avatarFor={avatarFor}
          nameFor={nameFor}
          onTagClick={(tag) => {
            setOpenIndex(null);
            setActiveTag(tag);
          }}
          onIndex={setOpenIndex}
          onClose={() => setOpenIndex(null)}
          onDeleted={async () => {
            setOpenIndex(null);
            await load();
          }}
        />
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

function TagChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 12px",
        borderRadius: 999,
        border: "none",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        background: on ? "var(--blue-bright)" : "var(--line)",
        color: on ? "#fff" : "var(--muted)",
      }}
    >
      {label}
    </button>
  );
}

/** Caption with each hashtag rendered as a filter link. */
function Caption({
  text,
  onTagClick,
  style,
}: {
  text: string;
  onTagClick: (tag: string) => void;
  style?: React.CSSProperties;
}) {
  const parts: { text: string; tag?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(hashtagRegex())) {
    const at = m.index!;
    if (at > last) parts.push({ text: text.slice(last, at) });
    parts.push({ text: m[0], tag: m[1]!.toLowerCase() });
    last = at + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });

  return (
    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", ...style }}>
      {parts.map((p, i) =>
        p.tag ? (
          <button
            key={i}
            onClick={() => onTagClick(p.tag!)}
            style={{ ...linkBtn, color: "var(--blue-bright)", fontSize: "inherit", fontWeight: 600 }}
          >
            {p.text}
          </button>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </p>
  );
}

/** One post as a full-width card — the Instagram-style single column. */
function PhotoCard({
  post,
  clubId,
  myUid,
  canDelete,
  authorAvatar,
  taggedNames,
  onOpen,
  onTagClick,
  onDeleted,
}: {
  post: ClubPost;
  clubId: string;
  myUid: string;
  canDelete: boolean;
  authorAvatar?: string;
  taggedNames: string[];
  onOpen: (url: string) => void;
  onTagClick: (tag: string) => void;
  onDeleted: () => void;
}) {
  const urls = post.mediaUrls ?? [];
  const [liked, setLiked] = useState((post.likedBy ?? []).includes(myUid));
  const [likeCount, setLikeCount] = useState(post.likeCount ?? 0);

  // The card keeps its key across a reload, so the initial state above only
  // runs once — resync when the server's counts come back.
  useEffect(() => {
    setLiked((post.likedBy ?? []).includes(myUid));
    setLikeCount(post.likeCount ?? 0);
  }, [post.likeCount, post.likedBy, myUid]);

  const onToggleLike = () => {
    setLiked((v) => !v);
    setLikeCount((n) => n + (liked ? -1 : 1));
    void togglePostLike(clubId, post.id, myUid).catch(() => undefined);
  };

  const onDelete = async () => {
    if (!window.confirm("Delete this photo? This removes the whole post and can't be undone.")) return;
    try {
      await deleteClubPostWithMedia(clubId, post.id);
      onDeleted();
    } catch {
      window.alert("Couldn't delete that post.");
    }
  };

  if (urls.length === 0) return null;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12 }}>
        <Avatar uri={authorAvatar} name={post.authorName} uid={post.authorId} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{post.authorName}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {new Date(post.createdAt).toLocaleDateString()}
          </div>
        </div>
        {canDelete && (
          <button onClick={() => void onDelete()} style={{ ...linkBtn, color: "#ef4444" }}>
            Delete
          </button>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: urls.length === 1 ? "1fr" : "repeat(2, 1fr)",
          gap: 2,
        }}
      >
        {urls.map((url, i) => (
          <button
            key={i}
            onClick={() => onOpen(url)}
            style={{
              border: "none",
              padding: 0,
              background: "none",
              cursor: "pointer",
              aspectRatio: urls.length === 1 ? "4 / 5" : "1 / 1",
              overflow: "hidden",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </button>
        ))}
      </div>

      <div style={{ padding: 12, display: "grid", gap: 6 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <button
            onClick={onToggleLike}
            style={{ ...linkBtn, fontSize: 18, color: liked ? "#FF6B5E" : "var(--muted)" }}
          >
            {liked ? "♥" : "♡"}
          </button>
          <button onClick={() => onOpen(urls[0]!)} style={{ ...linkBtn, fontSize: 14 }}>
            💬 {post.commentCount ?? 0}
          </button>
        </div>

        {likeCount > 0 && (
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            {likeCount} like{likeCount === 1 ? "" : "s"}
          </div>
        )}

        {post.content.trim().length > 0 && (
          <Caption text={post.content} onTagClick={onTagClick} />
        )}

        {taggedNames.length > 0 && (
          <div style={{ fontSize: 12, color: "var(--muted)" }}>👥 {taggedNames.join(", ")}</div>
        )}
      </div>
    </div>
  );
}

/** Caption + people tagging, between picking files and uploading them. */
function ComposeDialog({
  files,
  members,
  onCancel,
  onPost,
}: {
  files: File[];
  members: ClubMember[];
  onCancel: () => void;
  onPost: (files: File[], caption: string, taggedUids: string[]) => void;
}) {
  const [caption, setCaption] = useState("");
  const [tagged, setTagged] = useState<string[]>([]);

  // Object URLs must be revoked or the blobs leak for the tab's lifetime.
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const toggle = (uid: string) =>
    setTagged((cur) => (cur.includes(uid) ? cur.filter((u) => u !== uid) : [...cur, uid]));

  return (
    <div
      onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "grid", placeItems: "center", zIndex: 60, padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: "100%", maxWidth: 520, maxHeight: "88vh", overflowY: "auto", display: "grid", gap: 12 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>New post</h2>
          <button onClick={onCancel} style={{ ...linkBtn, fontSize: 20 }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
          {previews.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt=""
              style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 10, flexShrink: 0 }}
            />
          ))}
        </div>

        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Write a caption… #raceday"
          maxLength={1000}
          rows={4}
          style={{ padding: 10, borderRadius: 8, border: "1px solid var(--line)", background: "transparent", color: "inherit", font: "inherit", fontSize: 14, resize: "vertical" }}
        />
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: -6 }}>
          Hashtags in the caption become filters everyone can tap.
        </div>

        {members.length > 0 && (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.8, textTransform: "uppercase" }}>
              Tag people{tagged.length > 0 ? ` · ${tagged.length}` : ""}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {members.map((m) => {
                const on = tagged.includes(m.uid);
                return (
                  <button
                    key={m.uid}
                    onClick={() => toggle(m.uid)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 10px 4px 4px",
                      borderRadius: 999,
                      border: "none",
                      cursor: "pointer",
                      fontSize: 13,
                      background: on ? "var(--blue-bright)" : "var(--line)",
                      color: on ? "#fff" : "inherit",
                    }}
                  >
                    <Avatar uri={m.avatarUrl} name={m.displayName} uid={m.uid} size={22} />
                    {m.displayName}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <button
          onClick={() => onPost(files, caption, tagged)}
          style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "var(--blue-bright)", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 }}
        >
          Post {files.length} photo{files.length === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}

function PhotoViewer({
  tiles,
  index,
  clubId,
  myUid,
  myName,
  isStaff,
  avatarFor,
  nameFor,
  onTagClick,
  onIndex,
  onClose,
  onDeleted,
}: {
  tiles: Tile[];
  index: number;
  clubId: string;
  myUid: string;
  myName: string;
  isStaff: boolean;
  avatarFor: (uid: string) => string | undefined;
  nameFor: (uid: string) => string | undefined;
  onTagClick: (tag: string) => void;
  onIndex: (i: number) => void;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const tile = tiles[index]!;
  const post = tile.post;
  const [liked, setLiked] = useState((post.likedBy ?? []).includes(myUid));
  const [likeCount, setLikeCount] = useState(post.likeCount ?? 0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");

  useEffect(() => {
    setLiked((post.likedBy ?? []).includes(myUid));
    setLikeCount(post.likeCount ?? 0);
    void getPostComments(clubId, post.id).then(setComments).catch(() => undefined);
  }, [post.id, myUid, clubId, post.likeCount, post.likedBy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex(Math.min(index + 1, tiles.length - 1));
      if (e.key === "ArrowLeft") onIndex(Math.max(index - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, tiles.length, onClose, onIndex]);

  const onToggleLike = () => {
    setLiked((v) => !v);
    setLikeCount((n) => n + (liked ? -1 : 1));
    void togglePostLike(clubId, post.id, myUid).catch(() => undefined);
  };

  const onSendComment = async () => {
    const content = commentText.trim();
    if (!content) return;
    setCommentText("");
    try {
      await addPostComment(clubId, post.id, myUid, myName, content);
      setComments(await getPostComments(clubId, post.id));
    } catch {
      // Non-critical; the comment just doesn't appear.
    }
  };

  /**
   * Share via the Web Share API where it exists, falling back to a download.
   * Desktop browsers largely can't hand a file to Instagram, so this is
   * best-effort by nature — the mobile app is the reliable path.
   */
  const onShare = async () => {
    try {
      const res = await fetch(tile.url);
      const blob = await res.blob();
      const file = new File([blob], `imuatrak-${post.id}.jpg`, { type: blob.type || "image/jpeg" });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file] });
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.alert("Couldn't share that photo.");
    }
  };

  const onDelete = async () => {
    if (!window.confirm("Delete this photo? This removes the whole post and can't be undone.")) return;
    try {
      await deleteClubPostWithMedia(clubId, post.id);
      onDeleted();
    } catch {
      window.alert("Couldn't delete that post.");
    }
  };

  const canDelete = post.authorId === myUid || isStaff;
  const taggedNames = (post.taggedUids ?? []).map(nameFor).filter((n): n is string => !!n);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.92)", display: "grid", placeItems: "center", zIndex: 50, padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 320px)", gap: 16, maxWidth: 1100, width: "100%", maxHeight: "90vh" }}
      >
        <div style={{ display: "grid", placeItems: "center", minHeight: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={tile.url} alt="" style={{ maxWidth: "100%", maxHeight: "88vh", objectFit: "contain" }} />
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: "88vh", overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Avatar uri={avatarFor(post.authorId)} name={post.authorName} uid={post.authorId} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{post.authorName}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {new Date(post.createdAt).toLocaleDateString()}
              </div>
            </div>
            <button onClick={onClose} style={{ ...linkBtn, fontSize: 20 }}>✕</button>
          </div>

          {post.content.trim().length > 0 && (
            <Caption text={post.content} onTagClick={onTagClick} />
          )}

          {taggedNames.length > 0 && (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>👥 {taggedNames.join(", ")}</div>
          )}

          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <button onClick={onToggleLike} style={{ ...linkBtn, fontSize: 15, color: liked ? "#FF6B5E" : "var(--muted)" }}>
              {liked ? "♥" : "♡"} {likeCount}
            </button>
            <button onClick={() => void onShare()} style={{ ...linkBtn, fontSize: 14 }}>Share</button>
            {canDelete && (
              <button onClick={() => void onDelete()} style={{ ...linkBtn, fontSize: 14, color: "#ef4444" }}>
                Delete
              </button>
            )}
            <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>
              {index + 1} / {tiles.length}
            </span>
          </div>

          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
            {comments.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>No comments yet.</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{c.authorName}</div>
                  <div style={{ fontSize: 13 }}>{c.content}</div>
                </div>
              ))
            )}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void onSendComment();
                }
              }}
              placeholder="Add a comment…"
              maxLength={500}
              style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "transparent", color: "inherit", font: "inherit", fontSize: 13 }}
            />
            <button
              onClick={() => void onSendComment()}
              disabled={!commentText.trim()}
              style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: commentText.trim() ? "var(--blue-bright)" : "var(--line)", color: commentText.trim() ? "#fff" : "var(--muted)", fontWeight: 700, cursor: commentText.trim() ? "pointer" : "default", fontSize: 13 }}
            >
              Post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
