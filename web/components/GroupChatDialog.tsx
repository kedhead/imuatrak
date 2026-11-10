"use client";

import { useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import type { ClubMember } from "@/lib/clubTypes";

/** Mirrors GROUP_NAME_MAX / GROUP_MAX_MEMBERS in firebase/functions/src/groupChat.ts. */
export const GROUP_NAME_MAX = 50;
export const GROUP_MAX_MEMBERS = 50;

/**
 * Pick people (and a name, when starting a group). Used for "New group" and
 * for "Add people" on an existing one; the server re-checks everything.
 */
export function GroupChatDialog({
  mode,
  members,
  myUid,
  existing = [],
  onSubmit,
  onClose,
}: {
  mode: "create" | "add";
  members: ClubMember[];
  myUid: string;
  /** Already in the group (add mode): shown ticked and locked. */
  existing?: string[];
  onSubmit: (name: string, uids: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const people = useMemo(
    () =>
      members
        .filter((m) => m.uid !== myUid)
        .filter((m) => m.displayName.toLowerCase().includes(filter.trim().toLowerCase()))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [members, myUid, filter],
  );

  const total = existing.length + picked.size + (mode === "create" ? 1 : 0);
  const canSubmit =
    !busy &&
    (mode === "create" ? picked.size >= 2 && name.trim().length > 0 : picked.size > 0) &&
    total <= GROUP_MAX_MEMBERS;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(name.trim(), [...picked]);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^FirebaseError:\s*/, "") : "Please try again.");
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center", zIndex: 200, padding: 16 }}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 440, maxHeight: "85vh", display: "flex", flexDirection: "column", gap: 12 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{mode === "create" ? "New group chat" : "Add people"}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 18, cursor: "pointer" }} aria-label="Close">
            ✕
          </button>
        </div>

        {mode === "create" && (
          <input
            autoFocus
            placeholder="Group name, e.g. Saturday OC6 crew"
            maxLength={GROUP_NAME_MAX}
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inp}
          />
        )}
        <input placeholder="Search members" value={filter} onChange={(e) => setFilter(e.target.value)} style={inp} />

        <div style={{ overflowY: "auto", flex: 1, minHeight: 120, display: "grid", gap: 2, alignContent: "start" }}>
          {people.map((m) => {
            const locked = existing.includes(m.uid);
            const on = locked || picked.has(m.uid);
            return (
              <label
                key={m.uid}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 8, cursor: locked ? "default" : "pointer", opacity: locked ? 0.55 : 1, background: on && !locked ? "var(--panel)" : "transparent" }}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={locked}
                  onChange={() =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (next.has(m.uid)) next.delete(m.uid);
                      else next.add(m.uid);
                      return next;
                    })
                  }
                />
                <Avatar uri={m.avatarUrl} name={m.displayName} uid={m.uid} size={30} />
                <span style={{ flex: 1, fontSize: 14 }}>{m.displayName}</span>
                {locked && <span className="muted" style={{ fontSize: 12 }}>in group</span>}
              </label>
            );
          })}
          {people.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No members match.</p>}
        </div>

        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          🔒 Only the people in a group can see it. Club admins can&apos;t, unless they&apos;re added.
          {mode === "create" && picked.size < 2 && " Pick at least two people; for one person, send a direct message."}
        </p>
        {error && <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div>}
        <button
          onClick={() => void submit()}
          disabled={!canSubmit}
          style={{ background: canSubmit ? "var(--blue)" : "var(--line)", color: canSubmit ? "#fff" : "var(--muted)", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 700, cursor: canSubmit ? "pointer" : "default", fontSize: 14 }}
        >
          {busy ? "Working…" : mode === "create" ? `Start group${picked.size ? ` (${picked.size + 1} people)` : ""}` : `Add ${picked.size || ""}`.trim()}
        </button>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--line)",
  fontSize: 14,
  background: "var(--bg)",
  color: "var(--ink)",
  width: "100%",
  boxSizing: "border-box",
};
