"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { getUserClub, getClubEvents, createClubEvent, bulkCreateClubEvents, deleteClubEvent } from "@/lib/firebase";
import type { ClubEvent, EventType, MemberRole } from "@/lib/clubTypes";

const TYPE_COLOR: Record<EventType, string> = {
  practice: "var(--blue-bright)",
  race: "#ef4444",
  social: "#0d9488",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DURATIONS = [30, 45, 60, 90, 120];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EventsPage() {
  const { user, loading } = useAuth();
  const [clubId, setClubId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<MemberRole | null>(null);
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [tab, setTab] = useState<"list" | "single" | "bulk">("list");

  const canManage = myRole === "owner" || myRole === "admin" || myRole === "coach";
  const now = new Date().toISOString();
  const upcoming = useMemo(() => events.filter((e) => e.endAt >= now).sort((a, b) => a.startAt.localeCompare(b.startAt)), [events, now]);
  const past = useMemo(() => events.filter((e) => e.endAt < now).sort((a, b) => b.startAt.localeCompare(a.startAt)), [events, now]);

  useEffect(() => {
    if (!user) return;
    getUserClub(user.uid).then((ctx) => {
      if (!ctx) return;
      setClubId(ctx.club.id);
      setMyRole(ctx.role);
      getClubEvents(ctx.club.id).then(setEvents);
    });
  }, [user]);

  const reload = (id: string) => getClubEvents(id).then(setEvents);

  const handleDelete = async (id: string, title: string) => {
    if (!clubId || !confirm(`Delete "${title}"?`)) return;
    await deleteClubEvent(clubId, id);
    setEvents((prev) => prev.filter((e) => e.id !== id));
  };

  if (loading) return <div className="container"><p style={{ color: "var(--muted)" }}>Loading…</p></div>;

  return (
    <main className="container" style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link href="/dashboard/club" style={{ color: "var(--muted)", fontSize: 13, textDecoration: "none" }}>← Club Dashboard</Link>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Events</h1>
          {canManage && (
            <div style={{ display: "flex", gap: 8 }}>
              <TabBtn active={tab === "list"} onClick={() => setTab("list")}>All events</TabBtn>
              <TabBtn active={tab === "single"} onClick={() => setTab("single")} accent>+ Single event</TabBtn>
              <TabBtn active={tab === "bulk"} onClick={() => setTab("bulk")} accent>⊞ Bulk schedule</TabBtn>
            </div>
          )}
        </div>
      </div>

      {/* Forms */}
      {tab === "single" && clubId && user && (
        <SingleEventForm
          clubId={clubId}
          uid={user.uid}
          onCreated={() => { reload(clubId); setTab("list"); }}
          onCancel={() => setTab("list")}
        />
      )}
      {tab === "bulk" && clubId && user && (
        <BulkScheduleForm
          clubId={clubId}
          uid={user.uid}
          onCreated={(n) => { reload(clubId); setTab("list"); alert(`Created ${n} events!`); }}
          onCancel={() => setTab("list")}
        />
      )}

      {/* Event list */}
      {tab === "list" && (
        <>
          {upcoming.length > 0 && (
            <EventSection title="Upcoming" events={upcoming} canManage={canManage} onDelete={handleDelete} />
          )}
          {past.length > 0 && (
            <EventSection title="Past" events={past} canManage={canManage} onDelete={handleDelete} muted />
          )}
          {events.length === 0 && (
            <div className="card" style={{ textAlign: "center", padding: 56, color: "var(--muted)" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
              <p style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)", margin: "0 0 6px" }}>No events yet</p>
              {canManage && <p style={{ margin: 0 }}>Use the buttons above to schedule your first event or bulk-schedule a full season.</p>}
            </div>
          )}
        </>
      )}
    </main>
  );
}

// ─── Event list section ───────────────────────────────────────────────────────

function EventSection({ title, events, canManage, onDelete, muted }: { title: string; events: ClubEvent[]; canManage: boolean; onDelete: (id: string, title: string) => void; muted?: boolean }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", margin: "0 0 10px" }}>{title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {events.map((e) => {
          const start = new Date(e.startAt);
          const goingCount = e.rsvps.filter((r) => r.status === "going").length;
          return (
            <div key={e.id} className="card" style={{ opacity: muted ? 0.7 : 1, display: "grid", gridTemplateColumns: "4px 1fr auto", gap: 0, padding: 0, overflow: "hidden" }}>
              <div style={{ background: TYPE_COLOR[e.type] }} />
              <div style={{ padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ background: TYPE_COLOR[e.type], color: "#fff", fontSize: 10, fontWeight: 800, letterSpacing: 1, borderRadius: 4, padding: "2px 7px", textTransform: "uppercase" }}>{e.type}</span>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{e.title}</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span>
                    {start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                    {" · "}
                    {start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </span>
                  {e.location?.name && <span>📍 {e.location.name}</span>}
                  {goingCount > 0 && <span>✓ {goingCount} going</span>}
                </div>
              </div>
              {canManage && (
                <div style={{ display: "flex", alignItems: "center", padding: "0 16px" }}>
                  <button
                    onClick={() => onDelete(e.id, e.title)}
                    style={{ fontSize: 12, color: "#ef4444", background: "none", border: "1px solid #ef4444", borderRadius: 6, padding: "4px 10px", cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Single event form ────────────────────────────────────────────────────────

function SingleEventForm({ clubId, uid, onCreated, onCancel }: { clubId: string; uid: string; onCreated: () => void; onCancel: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [type, setType] = useState<EventType>("practice");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("07:00");
  const [durationMin, setDurationMin] = useState(90);
  const [location, setLocation] = useState("");
  const [meetTime, setMeetTime] = useState("");
  const [maxStr, setMaxStr] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!title || !date || !time) return;
    setSaving(true);
    const startAt = new Date(`${date}T${time}`).toISOString();
    const endAt = new Date(new Date(startAt).getTime() + durationMin * 60 * 1000).toISOString();
    await createClubEvent(clubId, uid, { title, type, description, startAt, endAt, location, meetTime });
    setSaving(false);
    onCreated();
  };

  return (
    <div className="card" style={{ marginBottom: 28, padding: "24px 28px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>New Event</h3>
        <button onClick={onCancel} style={ghostBtn}>Cancel</button>
      </div>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
        {/* Type */}
        <FormRow label="Event type">
          <div style={{ display: "flex", gap: 8 }}>
            {(["practice", "race", "social"] as EventType[]).map((t) => (
              <TypePill key={t} type={t} active={type === t} onClick={() => setType(t)} />
            ))}
          </div>
        </FormRow>

        {/* Title */}
        <FormRow label="Title *">
          <input required placeholder="e.g. Morning Practice" value={title} onChange={(e) => setTitle(e.target.value)} style={inp} />
        </FormRow>

        {/* Date & Time */}
        <FormRow label="Date & time *">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <input required type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} style={inp} />
            <input required type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inp} />
            <select value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} style={inp}>
              {DURATIONS.map((d) => <option key={d} value={d}>{d >= 60 ? `${d / 60}h` : `${d}m`} duration</option>)}
            </select>
          </div>
        </FormRow>

        {/* Location & meet */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <FormRow label="Location">
            <input placeholder="e.g. Keehi Lagoon" value={location} onChange={(e) => setLocation(e.target.value)} style={inp} />
          </FormRow>
          <FormRow label="Meet time">
            <input placeholder="e.g. 6:45 AM" value={meetTime} onChange={(e) => setMeetTime(e.target.value)} style={inp} />
          </FormRow>
        </div>

        {/* Capacity */}
        <FormRow label="Max participants (optional)">
          <input type="number" min={1} placeholder="Unlimited" value={maxStr} onChange={(e) => setMaxStr(e.target.value)} style={{ ...inp, maxWidth: 180 }} />
        </FormRow>

        {/* Description */}
        <FormRow label="Description">
          <textarea placeholder="Additional details…" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...inp, resize: "vertical" }} />
        </FormRow>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
          <button type="submit" disabled={saving} style={primaryBtn}>{saving ? "Creating…" : "Create Event"}</button>
        </div>
      </form>
    </div>
  );
}

// ─── Bulk schedule form ───────────────────────────────────────────────────────

function BulkScheduleForm({ clubId, uid, onCreated, onCancel }: { clubId: string; uid: string; onCreated: (n: number) => void; onCancel: () => void }) {
  const [type, setType] = useState<EventType>("practice");
  const [title, setTitle] = useState("Morning Practice");
  const [location, setLocation] = useState("");
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set([2, 4, 6]));
  const [dayTimes, setDayTimes] = useState<Map<number, string>>(() => new Map([2, 4, 6].map((d) => [d, "07:00"])));
  const [rangeStart, setRangeStart] = useState(new Date().toISOString().slice(0, 10));
  const [rangeEnd, setRangeEnd] = useState(() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); });
  const [durationMin, setDurationMin] = useState(90);
  const [saving, setSaving] = useState(false);

  const toggleDay = (dow: number) => {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dow)) { next.delete(dow); } else { next.add(dow); setDayTimes((m) => new Map(m).set(dow, "07:00")); }
      return next;
    });
  };

  const previewCount = useMemo(() => {
    if (!rangeStart || !rangeEnd) return 0;
    let count = 0;
    const cur = new Date(rangeStart + "T00:00:00");
    const end = new Date(rangeEnd + "T23:59:59");
    while (cur <= end) { if (selectedDays.has(cur.getDay())) count++; cur.setDate(cur.getDate() + 1); }
    return count;
  }, [selectedDays, rangeStart, rangeEnd]);

  const handleCreate = async () => {
    if (selectedDays.size === 0) { alert("Select at least one day"); return; }
    if (!title.trim()) { alert("Enter a title"); return; }
    if (!rangeStart || !rangeEnd) { alert("Set a date range"); return; }
    if (previewCount === 0) { alert("No dates match your selection"); return; }
    if (!confirm(`Create ${previewCount} events?`)) return;

    setSaving(true);
    const schedule = Array.from(selectedDays).map((dow) => {
      const t = dayTimes.get(dow) ?? "07:00";
      const [h, m] = t.split(":").map(Number);
      return { dayOfWeek: dow, startHour: h ?? 7, startMinute: m ?? 0 };
    });
    const count = await bulkCreateClubEvents(clubId, uid, {
      title: title.trim(), type, location: location.trim() || undefined,
      schedule, durationMinutes: durationMin,
      rangeStart: new Date(rangeStart + "T00:00:00"),
      rangeEnd: new Date(rangeEnd + "T23:59:59"),
    });
    setSaving(false);
    onCreated(count);
  };

  return (
    <div className="card" style={{ marginBottom: 28, padding: "24px 28px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Bulk Schedule</h3>
        <button onClick={onCancel} style={ghostBtn}>Cancel</button>
      </div>

      <div style={{ display: "grid", gap: 20 }}>
        {/* Type */}
        <FormRow label="Event type">
          <div style={{ display: "flex", gap: 8 }}>
            {(["practice", "race", "social"] as EventType[]).map((t) => (
              <TypePill key={t} type={t} active={type === t} onClick={() => setType(t)} />
            ))}
          </div>
        </FormRow>

        {/* Title + Location */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <FormRow label="Title *">
            <input placeholder="e.g. Morning Practice" value={title} onChange={(e) => setTitle(e.target.value)} style={inp} />
          </FormRow>
          <FormRow label="Location (optional)">
            <input placeholder="e.g. Keehi Lagoon" value={location} onChange={(e) => setLocation(e.target.value)} style={inp} />
          </FormRow>
        </div>

        {/* Days of week */}
        <FormRow label="Days of week">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {DAY_NAMES.map((name, dow) => (
              <button key={dow} type="button" onClick={() => toggleDay(dow)}
                style={{ padding: "6px 14px", borderRadius: 20, border: "1.5px solid", borderColor: selectedDays.has(dow) ? "var(--blue-bright)" : "var(--line)", background: selectedDays.has(dow) ? "var(--blue-bright)" : "transparent", color: selectedDays.has(dow) ? "#fff" : "var(--muted)", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                {name}
              </button>
            ))}
          </div>
        </FormRow>

        {/* Per-day start times */}
        {selectedDays.size > 0 && (
          <FormRow label="Start time per day">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
              {Array.from(selectedDays).sort().map((dow) => (
                <div key={dow} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-soft, var(--bg))", borderRadius: 8, padding: "8px 12px" }}>
                  <span style={{ fontWeight: 700, fontSize: 13, minWidth: 32, color: "var(--ink)" }}>{DAY_NAMES[dow]}</span>
                  <input type="time" value={dayTimes.get(dow) ?? "07:00"} onChange={(e) => setDayTimes((m) => new Map(m).set(dow, e.target.value))} style={{ ...inp, flex: 1, padding: "4px 8px", fontSize: 13 }} />
                </div>
              ))}
            </div>
          </FormRow>
        )}

        {/* Duration */}
        <FormRow label="Duration">
          <div style={{ display: "flex", gap: 8 }}>
            {DURATIONS.map((d) => (
              <button key={d} type="button" onClick={() => setDurationMin(d)}
                style={{ padding: "6px 14px", borderRadius: 20, border: "1.5px solid", borderColor: durationMin === d ? "var(--blue-bright)" : "var(--line)", background: durationMin === d ? "var(--blue-bright)" : "transparent", color: durationMin === d ? "#fff" : "var(--muted)", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                {d >= 60 ? `${d / 60}h` : `${d}m`}
              </button>
            ))}
          </div>
        </FormRow>

        {/* Date range */}
        <FormRow label="Date range">
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center" }}>
            <input type="date" value={rangeStart} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setRangeStart(e.target.value)} style={inp} />
            <span style={{ color: "var(--muted)", fontWeight: 700, textAlign: "center" }}>→</span>
            <input type="date" value={rangeEnd} min={rangeStart} onChange={(e) => setRangeEnd(e.target.value)} style={inp} />
          </div>
        </FormRow>

        {/* Preview + Create */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, borderTop: "1px solid var(--line)", paddingTop: 20 }}>
          <div>
            <span style={{ fontSize: 36, fontWeight: 800, color: previewCount > 0 ? "var(--blue-bright)" : "var(--muted)" }}>{previewCount}</span>
            <span style={{ fontSize: 14, color: "var(--muted)", marginLeft: 8, fontWeight: 600 }}>events will be created</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
            <button type="button" onClick={handleCreate} disabled={saving || previewCount === 0} style={{ ...primaryBtn, opacity: previewCount === 0 ? 0.5 : 1 }}>
              {saving ? "Creating…" : `Create ${previewCount} Event${previewCount !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Shared UI pieces ─────────────────────────────────────────────────────────

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--muted)" }}>{label}</label>
      {children}
    </div>
  );
}

function TypePill({ type, active, onClick }: { type: EventType; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      style={{ flex: 1, padding: "8px 16px", borderRadius: 8, border: "1.5px solid", borderColor: active ? TYPE_COLOR[type] : "var(--line)", background: active ? TYPE_COLOR[type] : "transparent", color: active ? "#fff" : "var(--muted)", fontWeight: 700, cursor: "pointer", fontSize: 13, textTransform: "capitalize" }}>
      {type}
    </button>
  );
}

function TabBtn({ children, active, onClick, accent }: { children: React.ReactNode; active: boolean; onClick: () => void; accent?: boolean }) {
  return (
    <button onClick={onClick}
      style={{ fontSize: 13, padding: "8px 16px", borderRadius: 8, border: "1px solid", borderColor: active ? (accent ? "var(--blue-bright)" : "var(--line)") : "var(--line)", background: active ? (accent ? "var(--blue-bright)" : "var(--card)") : "transparent", color: active ? (accent ? "#fff" : "var(--ink)") : "var(--muted)", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
      {children}
    </button>
  );
}

const inp: React.CSSProperties = { padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 14, background: "var(--bg)", color: "var(--ink)", width: "100%", boxSizing: "border-box" };
const primaryBtn: React.CSSProperties = { background: "var(--blue-bright)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 22px", fontWeight: 700, cursor: "pointer", fontSize: 14 };
const ghostBtn: React.CSSProperties = { background: "transparent", color: "var(--muted)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 };
