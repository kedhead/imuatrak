"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import type { Club, ClubMember, ClubPost, MemberRole } from "@/lib/clubTypes";

type Comment = { id: string; content: string; authorId: string; authorName: string; createdAt: string };
type Tile = { post: ClubPost; url: string };

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
  const [uploading, setUploading] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const clubId = club && club !== "none" ? club.id : null;
  const isStaff = role === "owner" || role === "admin";

  useEffect(() => {
    if (!user) return;
    void getUserClub(user.uid).then((r) => {
      setClub(r?.club ?? "none");
      setRole(r?.role ?? null);
      if (r) void getClubMembers(r.club.id).then(setMembers);
    });
  }, [user]);

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

  const onPickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !clubId || !user) return;
    const images = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, 8);
    if (images.length === 0) return;

    setUploading(true);
    try {
      const postId = await createPhotoPost(clubId, user.uid, user.displayName ?? "Member");
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
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // One tile per photo, not per post — a post carrying four pictures should
  // read as four tiles.
  const tiles: Tile[] = posts.flatMap((post) =>
    (post.mediaUrls ?? []).map((url) => ({ post, url })),
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
          onChange={(e) => void onPickFiles(e.target.files)}
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

      {loaded && tiles.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📷</div>
          <h2 style={{ margin: "0 0 8px" }}>No photos yet</h2>
          <p style={{ color: "var(--muted)" }}>
            Post the first one — race day, practice, whatever the crew got up to.
          </p>
        </div>
      ) : (
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
      )}

      {openIndex !== null && tiles[openIndex] && (
        <PhotoViewer
          tiles={tiles}
          index={openIndex}
          clubId={club.id}
          myUid={user.uid}
          myName={user.displayName ?? "Member"}
          isStaff={isStaff}
          avatarFor={(uid) => members.find((m) => m.uid === uid)?.avatarUrl}
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

function PhotoViewer({
  tiles,
  index,
  clubId,
  myUid,
  myName,
  isStaff,
  avatarFor,
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
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{post.content}</p>
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
