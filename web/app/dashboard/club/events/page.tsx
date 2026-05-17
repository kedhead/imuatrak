"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { getUserClub, getClubEvents, createClubEvent, deleteClubEvent } from "@/lib/firebase";
import type { ClubEvent, EventType, MemberRole } from "@/lib/clubTypes";

const TYPE_COLOR: Record<EventType, string> = {
  practice: "var(--blue-bright)",
  race: "#ef4444",
  social: "var(--teal)",
};

export default function EventsPage() {
  const { user, loading } = useAuth();
  const [clubId, setClubId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<MemberRole | null>(null);
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [showForm, setShowForm] = useState(false);

  const canManage = myRole === "owner" || myRole === "admin" || myRole === "coach";
  const now = new Date().toISOString();
  const upcoming = events.filter((e) => e.endAt >= now);
  const past = events.filter((e) => e.endAt < now);

  useEffect(() => {
    if (!user) return;
    getUserClub(user.uid).then((ctx) => {
      if (!ctx) return;
      setClubId(ctx.club.id);
      setMyRole(ctx.role);
      getClubEvents(ctx.club.id).then(setEvents);
    });
  }, [user]);

  const handleDelete = async (id: string, title: string) => {
    if (!clubId || !confirm(`Delete "${title}"?`)) return;
    await deleteClubEvent(clubId, id);
    setEvents((prev) => prev.filter((e) => e.id !== id));
  };

  if (loading) return <div className="container"><p style={{ color: "var(--muted)" }}>Loading…</p></div>;

  return (
    <main className="container">
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <Link href="/dashboard/club" style={{ color: "var(--muted)", fontSize: 13 }}>← Club Dashboard</Link>
          <h1 style={{ margin: "8px 0 0", fontSize: 28, fontWeight: 800 }}>Events</h1>
        </div>
        {canManage && (
          <button onClick={() => setShowForm((v) => !v)} style={{ background: "var(--blue-bright)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
            {showForm ? "Cancel" : "+ New Event"}
          </button>
        )}
      </div>

      {showForm && clubId && user && (
        <CreateEventForm
          clubId={clubId}
          uid={user.uid}
          onCreated={(e) => { setEvents((prev) => [e, ...prev].sort((a, b) => a.startAt.localeCompare(b.startAt))); setShowForm(false); }}
        />
      )}

      {upcoming.length > 0 && <EventSection title="Upcoming" events={upcoming} canManage={canManage} onDelete={handleDelete} />}
      {past.length > 0 && <EventSection title="Past" events={past} canManage={canManage} onDelete={handleDelete} muted />}
      {events.length === 0 && !showForm && (
        <div className="card" style={{ textAlign: "center", padding: 48, color: "var(--muted)" }}>No events yet. {canManage ? "Create the first one!" : ""}</div>
      )}
    </main>
  );
}

function EventSection({ title, events, canManage, onDelete, muted }: { title: string; events: ClubEvent[]; canManage: boolean; onDelete: (id: string, title: string) => void; muted?: boolean }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", margin: "0 0 12px" }}>{title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {events.map((e) => (
          <div key={e.id} className="card" style={{ opacity: muted ? 0.7 : 1, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ background: TYPE_COLOR[e.type], color: "#fff", fontSize: 10, fontWeight: 800, letterSpacing: 1, borderRadius: 4, padding: "2px 7px", textTransform: "uppercase" }}>{e.type}</span>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{e.title}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                {new Date(e.startAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · {new Date(e.startAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                {e.location?.name && <span> · {e.location.name}</span>}
              </div>
              {e.rsvps.length > 0 && (
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                  {e.rsvps.filter((r) => r.status === "going").length} going · {e.linkedSessionIds.length} session{e.linkedSessionIds.length !== 1 ? "s" : ""}
                </div>
              )}
            </div>
            {canManage && (
              <button onClick={() => onDelete(e.id, e.title)} style={{ fontSize: 12, color: "#ef4444", background: "none", border: "1px solid #ef4444", borderRadius: 6, padding: "4px 12px", cursor: "pointer" }}>
                Delete
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function CreateEventForm({ clubId, uid, onCreated }: { clubId: string; uid: string; onCreated: (e: ClubEvent) => void }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<EventType>("practice");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [meetTime, setMeetTime] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date || !time) return;
    setSaving(true);
    const startAt = new Date(`${date}T${time}`).toISOString();
    const endAt = new Date(new Date(startAt).getTime() + 2 * 60 * 60 * 1000).toISOString();
    await createClubEvent(clubId, uid, { title, type, description, startAt, endAt, location, meetTime });
    // Optimistic — reload events
    const fresh = await import("@/lib/firebase").then((m) => m.getClubEvents(clubId));
    const created = fresh.find((ev) => ev.title === title && ev.startAt === startAt);
    if (created) onCreated(created);
    setSaving(false);
  };

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <h3 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700 }}>New Event</h3>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {(["practice", "race", "social"] as EventType[]).map((t) => (
            <button key={t} type="button" onClick={() => setType(t)}
              style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "1.5px solid", borderColor: type === t ? TYPE_COLOR[t] : "var(--line)", background: type === t ? TYPE_COLOR[t] : "transparent", color: type === t ? "#fff" : "var(--muted)", fontWeight: 700, cursor: "pointer", fontSize: 13, textTransform: "capitalize" }}>
              {t}
            </button>
          ))}
        </div>
        <input required placeholder="Title *" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
          <input required type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inputStyle} />
        </div>
        <input placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} />
        <input placeholder="Meet time (e.g. 6:45 AM)" value={meetTime} onChange={(e) => setMeetTime(e.target.value)} style={inputStyle} />
        <textarea placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
        <button type="submit" disabled={saving} style={{ background: "var(--blue-bright)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 0", fontWeight: 700, cursor: "pointer", fontSize: 15 }}>
          {saving ? "Creating…" : "Create Event"}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 14, background: "var(--bg)", color: "var(--ink)", width: "100%", boxSizing: "border-box" };
