"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClubMember } from "@/lib/clubTypes";
import {
  addSignupItems,
  addWriteInItem,
  clampSlots,
  claimCount,
  claimSignupSlot,
  clearSignupSheet,
  deleteSignupItem,
  openSlots,
  releaseSignupSlot,
  SIGNUP_DETAILS_MAX,
  SIGNUP_ITEMS_MAX,
  SIGNUP_LABEL_MAX,
  SIGNUP_NOTE_MAX,
  SIGNUP_SLOTS_MAX,
  SIGNUP_TEMPLATES,
  signupProgress,
  sortedClaims,
  sortSignupItems,
  subscribeSignupItems,
  updateSignupItem,
  type SignupItem,
} from "@/lib/signups";

type Editing =
  | { kind: "claim"; itemId: string; note: string }
  | { kind: "edit"; itemId: string | null; label: string; details: string; slots: number }
  | { kind: "writeIn"; label: string; note: string };

/**
 * An event's sign-up sheet: staff build it (templates, add, edit, clear);
 * any member claims a slot or adds a write-in. Live, so claims from phones
 * show up here as they happen.
 */
export function SignupSheet({
  clubId,
  eventId,
  uid,
  myName,
  isStaff,
  members,
}: {
  clubId: string;
  eventId: string;
  uid: string;
  myName: string;
  isStaff: boolean;
  members: ClubMember[];
}) {
  const [items, setItems] = useState<SignupItem[] | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => subscribeSignupItems(clubId, eventId, setItems, (e) => { setItems([]); setError(e.message); }),
    [clubId, eventId],
  );

  const sorted = useMemo(() => sortSignupItems(items ?? []), [items]);
  if (items === null) return <p style={muted}>Loading sign-up sheet…</p>;

  const progress = signupProgress(sorted);
  const nextOrder = sorted.reduce((max, it) => Math.max(max, it.order), -1) + 1;
  const atCap = items.length >= SIGNUP_ITEMS_MAX;
  const nameFor = (id: string, fallback: string) => members.find((m) => m.uid === id)?.displayName ?? fallback;

  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setEditing(null);
      after?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const addTemplate = (id: string) => {
    const t = SIGNUP_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    const room = SIGNUP_ITEMS_MAX - items.length;
    if (room <= 0) return setError(`A sheet can hold ${SIGNUP_ITEMS_MAX} items.`);
    void run(() => addSignupItems(clubId, eventId, uid, t.items.slice(0, room), nextOrder));
  };

  const clearAll = () => {
    if (!confirm(`Remove all ${items.length} items and everyone's sign-ups? This can't be undone.`)) return;
    void run(() => clearSignupSheet(clubId, eventId));
  };

  const saveEdit = (e: Extract<Editing, { kind: "edit" }>) => {
    const label = e.label.trim();
    if (!label) return setError("Give the item a name.");
    const existing = e.itemId ? items.find((i) => i.id === e.itemId) : undefined;
    // Never shrink below the people already signed up.
    const slots = clampSlots(e.slots, existing ? claimCount(existing) : 1);
    void run(() =>
      e.itemId
        ? updateSignupItem(clubId, eventId, e.itemId, { label, slots, details: e.details })
        : addSignupItems(clubId, eventId, uid, [{ label, slots, details: e.details }], nextOrder),
    );
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>
          📝 Sign-up sheet
          {progress.total > 0 && (
            <span style={{ ...muted, fontWeight: 600, marginLeft: 8 }}>
              {progress.filled}/{progress.total} filled
            </span>
          )}
        </div>
        {isStaff && items.length > 0 && (
          <button onClick={clearAll} disabled={busy} style={{ ...linkBtn, color: "var(--danger)" }}>
            Clear all
          </button>
        )}
      </div>

      {progress.total > 0 && (
        <div style={{ height: 6, borderRadius: 3, background: "var(--line)", overflow: "hidden" }}>
          <div
            style={{
              width: `${Math.round((progress.filled / progress.total) * 100)}%`,
              height: "100%",
              background: progress.filled >= progress.total ? "var(--success)" : "var(--aqua)",
            }}
          />
        </div>
      )}

      {error && <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div>}

      {items.length === 0 && (
        <p style={{ ...muted, margin: 0 }}>
          {isStaff
            ? "No sheet yet. Start from a template or add your own items. Members will see it on this event."
            : "No sign-up sheet for this event."}
        </p>
      )}

      {sorted.map((item) => {
        const mine = !!item.claims[uid];
        const left = openSlots(item);
        const claims = sortedClaims(item);
        const isEditingThis =
          editing && editing.kind !== "writeIn" && editing.itemId === item.id;
        return (
          <div key={item.id} style={row}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {item.label}
                  {item.writeIn && <span style={{ ...muted, fontWeight: 500 }}> · write-in</span>}
                </div>
                {item.details && <div style={{ ...muted, fontSize: 12 }}>{item.details}</div>}
                <div style={{ fontSize: 12, marginTop: 4, color: left === 0 ? "var(--success)" : "var(--muted)", fontWeight: 600 }}>
                  {claimCount(item)}/{item.slots} {left === 0 ? "· covered ✓" : `· ${left} open`}
                </div>
                {claims.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    {claims.map((c) => (
                      <span key={c.uid} style={chip(c.uid === uid)}>
                        {nameFor(c.uid, c.name)}
                        {c.note ? ` · ${c.note}` : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {mine ? (
                  <>
                    <button
                      style={ghost}
                      disabled={busy}
                      onClick={() => setEditing({ kind: "claim", itemId: item.id, note: item.claims[uid]?.note ?? "" })}
                    >
                      Edit note
                    </button>
                    <button
                      style={ghost}
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          item.writeIn && item.createdBy === uid
                            ? deleteSignupItem(clubId, eventId, item.id)
                            : releaseSignupSlot(clubId, eventId, item.id, uid),
                        )
                      }
                    >
                      Drop
                    </button>
                  </>
                ) : left > 0 ? (
                  <button
                    style={primary}
                    disabled={busy}
                    onClick={() => setEditing({ kind: "claim", itemId: item.id, note: "" })}
                  >
                    I&apos;ll take it
                  </button>
                ) : null}
                {isStaff && (
                  <>
                    <button
                      style={ghost}
                      disabled={busy}
                      onClick={() =>
                        setEditing({ kind: "edit", itemId: item.id, label: item.label, details: item.details ?? "", slots: item.slots })
                      }
                    >
                      Edit
                    </button>
                    <button
                      style={{ ...ghost, color: "var(--danger)" }}
                      disabled={busy}
                      onClick={() => {
                        const n = claimCount(item);
                        if (n > 0 && !confirm(`Remove "${item.label}"? ${n} sign-up${n === 1 ? "" : "s"} will go with it.`)) return;
                        void run(() => deleteSignupItem(clubId, eventId, item.id));
                      }}
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </div>

            {isEditingThis && editing.kind === "claim" && (
              <form
                style={inlineForm}
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(() => claimSignupSlot(clubId, eventId, item.id, uid, myName, editing.note));
                }}
              >
                <input
                  style={input}
                  placeholder="Add a note (optional)"
                  maxLength={SIGNUP_NOTE_MAX}
                  value={editing.note}
                  onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                />
                <button type="submit" style={primary} disabled={busy}>{mine ? "Save" : "Sign me up"}</button>
                <button type="button" style={ghost} onClick={() => setEditing(null)}>Cancel</button>
              </form>
            )}
            {isEditingThis && editing.kind === "edit" && (
              <EditForm editing={editing} setEditing={setEditing} busy={busy} onSave={saveEdit} />
            )}
          </div>
        );
      })}

      {/* New item (staff) / write-in (members) */}
      {editing?.kind === "edit" && editing.itemId === null && (
        <div style={row}>
          <EditForm editing={editing} setEditing={setEditing} busy={busy} onSave={saveEdit} />
        </div>
      )}
      {editing?.kind === "writeIn" && (
        <form
          style={{ ...row, ...inlineForm, marginTop: 0 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!editing.label.trim()) return setError("Say what you're bringing.");
            void run(() => addWriteInItem(clubId, eventId, uid, myName, editing.label, editing.note));
          }}
        >
          <input
            autoFocus
            style={input}
            placeholder="What are you bringing?"
            maxLength={SIGNUP_LABEL_MAX}
            value={editing.label}
            onChange={(e) => setEditing({ ...editing, label: e.target.value })}
          />
          <input
            style={input}
            placeholder="Note (optional)"
            maxLength={SIGNUP_NOTE_MAX}
            value={editing.note}
            onChange={(e) => setEditing({ ...editing, note: e.target.value })}
          />
          <button type="submit" style={primary} disabled={busy}>Add</button>
          <button type="button" style={ghost} onClick={() => setEditing(null)}>Cancel</button>
        </form>
      )}

      {!editing && !atCap && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {isStaff ? (
            <>
              <button style={ghost} onClick={() => setEditing({ kind: "edit", itemId: null, label: "", details: "", slots: 1 })}>
                + Add item
              </button>
              <span style={{ ...muted, fontSize: 12, margin: "0 2px" }}>or add a template:</span>
              {SIGNUP_TEMPLATES.map((t) => (
                <button key={t.id} style={ghost} disabled={busy} onClick={() => addTemplate(t.id)}>
                  {t.emoji} {t.name}
                </button>
              ))}
            </>
          ) : (
            items.length > 0 && (
              <button style={ghost} onClick={() => setEditing({ kind: "writeIn", label: "", note: "" })}>
                + Bring something else
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

function EditForm({
  editing,
  setEditing,
  busy,
  onSave,
}: {
  editing: Extract<Editing, { kind: "edit" }>;
  setEditing: (e: Editing | null) => void;
  busy: boolean;
  onSave: (e: Extract<Editing, { kind: "edit" }>) => void;
}) {
  return (
    <form
      style={inlineForm}
      onSubmit={(e) => {
        e.preventDefault();
        onSave(editing);
      }}
    >
      <input
        autoFocus
        style={{ ...input, flex: "2 1 180px" }}
        placeholder="Item, e.g. Dessert"
        maxLength={SIGNUP_LABEL_MAX}
        value={editing.label}
        onChange={(e) => setEditing({ ...editing, label: e.target.value })}
      />
      <input
        style={{ ...input, flex: "2 1 180px" }}
        placeholder="Details (optional)"
        maxLength={SIGNUP_DETAILS_MAX}
        value={editing.details}
        onChange={(e) => setEditing({ ...editing, details: e.target.value })}
      />
      <label style={{ ...muted, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
        Slots
        <input
          type="number"
          min={1}
          max={SIGNUP_SLOTS_MAX}
          style={{ ...input, width: 70, flex: "0 0 70px" }}
          value={editing.slots}
          onChange={(e) => setEditing({ ...editing, slots: Number(e.target.value) })}
        />
      </label>
      <button type="submit" style={primary} disabled={busy}>{editing.itemId ? "Save" : "Add"}</button>
      <button type="button" style={ghost} onClick={() => setEditing(null)}>Cancel</button>
    </form>
  );
}

const muted: React.CSSProperties = { color: "var(--muted)", fontSize: 13 };
const row: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px", background: "var(--bg)" };
const inlineForm: React.CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 10 };
const input: React.CSSProperties = {
  flex: "1 1 200px",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--line)",
  background: "var(--card)",
  color: "var(--ink)",
  fontSize: 13,
};
const primary: React.CSSProperties = {
  background: "var(--blue)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "6px 12px",
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const ghost: React.CSSProperties = {
  background: "transparent",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: "6px 10px",
  fontWeight: 600,
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const linkBtn: React.CSSProperties = { background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, padding: 0 };
const chip = (me: boolean): React.CSSProperties => ({
  fontSize: 12,
  padding: "2px 9px",
  borderRadius: 999,
  border: `1px solid ${me ? "var(--aqua)" : "var(--line)"}`,
  color: me ? "var(--aqua)" : "var(--ink)",
  background: "var(--card)",
});
