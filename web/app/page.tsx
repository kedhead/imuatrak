import Link from "next/link";

export default function Landing() {
  return (
    <main className="container">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 48,
          alignItems: "center",
          marginBottom: 96,
        }}
        className="hero-grid"
      >
        <div>
          <p
            style={{
              color: "var(--blue-bright)",
              fontWeight: 600,
              letterSpacing: 2,
              textTransform: "uppercase",
              fontSize: 12,
              margin: "0 0 16px",
            }}
          >
            Imua — charge forward
          </p>
          <h1 style={{ fontSize: 48, lineHeight: 1.05, margin: "0 0 20px", fontWeight: 800 }}>
            A paddling tracker that actually knows what a stroke is.
          </h1>
          <p style={{ fontSize: 18, color: "var(--muted)", margin: "0 0 32px", lineHeight: 1.6 }}>
            GPS, real stroke detection from the IMU, splits, and heart rate from your
            watch. Plus clubs with chat, a practice calendar, and boat assignments.
            Built for outrigger, surfski, V1, and SUP — not &ldquo;Kayak (Other)&rdquo;.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <a className="btn" href="mailto:support@imuatrak.app">Join the waitlist</a>
            <a className="btn btn-outline" href="#features">See features</a>
          </div>
        </div>

        {/* Mock session preview card */}
        <MockSession />
      </section>

      {/* ── Share section ────────────────────────────────────────── */}
      <section
        style={{
          background: "var(--card)",
          border: "1px solid var(--line)",
          borderRadius: 20,
          padding: "40px 40px",
          marginBottom: 80,
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 32,
          alignItems: "center",
        }}
        className="share-section"
      >
        <div>
          <p style={{ color: "var(--blue-bright)", fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", fontSize: 11, margin: "0 0 8px" }}>
            Share any session
          </p>
          <h2 style={{ fontSize: 28, margin: "0 0 10px", fontWeight: 700 }}>
            Post a link to your club chat.
          </h2>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: 15, lineHeight: 1.6 }}>
            Flip a switch in the app and your session gets a public URL —
            speed chart, splits, route map — that anyone can open on any device.
            No account required to view.
          </p>
        </div>
        <div style={{ textAlign: "center", whiteSpace: "nowrap" }}>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 13,
              color: "var(--blue-bright)",
              background: "#0e1520",
              borderRadius: 8,
              padding: "8px 14px",
              border: "1px solid var(--line)",
            }}
          >
            imuatrak.app/s/…
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────── */}
      <section
        id="features"
        style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", marginBottom: 96 }}
      >
        <Feature icon="〽️" title="Real stroke detection">
          Counts strokes and live stroke rate from the phone&apos;s accelerometer —
          filtered peak detection tuned to paddling cadence, so waves and chop
          don&apos;t register as strokes.
        </Feature>
        <Feature icon="📍" title="GPS route, pace &amp; splits">
          Route map, speed and elevation charts, and splits every kilometer or
          mile — moving-time aware, so a coffee break doesn&apos;t tank your pace.
        </Feature>
        <Feature icon="⌚" title="Apple Watch app">
          Record from your wrist: start, pause, and stop on the watch, live
          heart rate and HR zones, &ldquo;Start Paddling&rdquo; with Siri. Workouts save
          to Apple Health.
        </Feature>
        <Feature icon="🗺️" title="GPX + shareable links">
          Every session exports clean GPX. Flip a switch to publish a public
          link you can drop in a club chat.
        </Feature>
        <Feature icon="🚣" title="Crafts that exist">
          OC1 / OC2 / OC6 / V1 / SUP / Surfski — different defaults for
          different boats. Not &ldquo;Kayak (Other)&rdquo;.
        </Feature>
        <Feature icon="📡" title="Built for the offline put-in">
          Records fully offline and saves to your phone. Sessions sync to your
          account when you&apos;re back online.
        </Feature>
        <Feature icon="📊" title="Stats that build up">
          Lifetime totals, personal bests, and paddling habits — distance,
          time, strokes, and streaks across every session.
        </Feature>
        <Feature icon="🏝️" title="Built for outrigger crews">
          Solo OC1 runs or six seats in the same canoe — track stroke rate,
          distance, and pace for every paddle.
        </Feature>
        <Feature icon="💧" title="Heart rate from your watch">
          Live heart rate streams from your Apple Watch into the session, with
          time-in-zone breakdowns in your history.
        </Feature>
      </section>

      {/* ── Clubs ─────────────────────────────────────────────────── */}
      <section id="clubs" style={{ marginBottom: 96 }}>
        <p
          style={{
            color: "var(--blue-bright)",
            fontWeight: 600,
            letterSpacing: 2,
            textTransform: "uppercase",
            fontSize: 12,
            margin: "0 0 12px",
          }}
        >
          Clubs
        </p>
        <h2 style={{ fontSize: 34, margin: "0 0 12px", fontWeight: 800 }}>
          Run your whole club from one app.
        </h2>
        <p style={{ fontSize: 16, color: "var(--muted)", margin: "0 0 32px", lineHeight: 1.6, maxWidth: 640 }}>
          Create a club, invite paddlers with a link, and keep the feed, chat,
          and practice calendar in the same place as everyone&apos;s training.
          Members join with roles — owner, admin, coach, member — so the right
          people can post announcements and set the schedule.
        </p>
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          <Feature icon="📣" title="Feed, polls &amp; announcements">
            Post announcements, updates, and polls to the club feed. Members
            like, comment, and vote — and you can link a session straight into
            a post.
          </Feature>
          <Feature icon="💬" title="Chat channels">
            Organized chat channels — public or private — with photo and video
            sharing and push notifications, so race-day logistics don&apos;t get
            buried.
          </Feature>
          <Feature icon="📅" title="Practice calendar &amp; RSVPs">
            Schedule practices, races, and socials with meet time and location.
            Members RSVP going / maybe / not going, so coaches know who&apos;s on
            the water before they load boats.
          </Feature>
          <Feature icon="🛶" title="Boat &amp; seat assignments">
            Assign crews seat-by-seat for each event, and bulk-schedule a whole
            season of recurring practices in one go.
          </Feature>
          <Feature icon="🖥️" title="Web dashboard">
            Admins manage members, events, and posts from the browser at
            imuatrak.app — no phone required.
          </Feature>
          <Feature icon="🔗" title="Invite links">
            Grow the roster with a shareable invite link. New members land in
            the club feed, chat, and calendar the moment they join.
          </Feature>
        </div>
      </section>

      {/* ── Download CTA ─────────────────────────────────────────── */}
      <section
        id="download"
        style={{
          textAlign: "center",
          padding: "64px 0",
          borderTop: "1px solid var(--line)",
          borderBottom: "1px solid var(--line)",
          marginBottom: 80,
        }}
      >
        <h2 style={{ fontSize: 32, margin: "0 0 12px", fontWeight: 700 }}>
          Coming soon to iOS &amp; Android
        </h2>
        <p style={{ color: "var(--muted)", marginTop: 0, fontSize: 15 }}>
          TestFlight + Play Internal Testing this season.
        </p>
        <a
          href="mailto:support@imuatrak.app"
          className="btn"
          style={{ marginTop: 20, display: "inline-block" }}
        >
          Email support@imuatrak.app to get on the list
        </a>
      </section>

      <footer
        style={{
          color: "var(--muted)",
          fontSize: 13,
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <span>© ImuaTrak</span>
        <span>
          <Link href="/support">Support</Link>
          {" · "}
          <Link href="/privacy">Privacy</Link>
          {" · "}
          <Link href="/terms">Terms</Link>
        </span>
      </footer>
    </main>
  );
}

function Feature({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div style={{ fontSize: 22, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{title}</div>
      <div style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

/** Static mock of what a shared session page looks like */
function MockSession() {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--line)",
        borderRadius: 20,
        padding: 24,
        fontSize: 13,
        boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>ImuaTrak</span>
        <span
          style={{
            fontSize: 12,
            padding: "5px 12px",
            border: "1px solid var(--line)",
            borderRadius: 8,
            color: "var(--muted)",
          }}
        >
          Share
        </span>
      </div>

      {/* Session title */}
      <p style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 4px", letterSpacing: 1, textTransform: "uppercase" }}>
        Wed, Apr 30 · 6:42 AM
      </p>
      <h3 style={{ fontSize: 28, margin: "0 0 4px", fontWeight: 800 }}>OC1</h3>
      <p style={{ color: "var(--muted)", margin: "0 0 16px", fontSize: 13 }}>
        12.40 km &nbsp;·&nbsp; 1:48:32 &nbsp;·&nbsp; 8:44 /km
      </p>

      {/* Fake map */}
      <div
        style={{
          height: 140,
          borderRadius: 12,
          overflow: "hidden",
          background: "#0a1622",
          marginBottom: 16,
          position: "relative",
          border: "1px solid var(--line)",
        }}
      >
        <svg viewBox="0 0 280 140" style={{ width: "100%", height: "100%" }}>
          <polyline
            points="30,110 60,95 90,80 110,70 130,62 155,58 175,55 190,60 210,68 230,75 250,85"
            fill="none"
            stroke="#3b82f6"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle cx="30" cy="110" r="5" fill="#22c55e" />
          <circle cx="250" cy="85" r="5" fill="#ef4444" />
        </svg>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
        {[
          ["Distance", "12.40 km"],
          ["Duration", "1:48:32"],
          ["Avg pace", "8:44 /km"],
          ["Strokes", "780"],
          ["Avg HR", "148 bpm"],
          ["Max speed", "14.2 km/h"],
        ].map(([label, value]) => (
          <div
            key={label}
            style={{
              background: "var(--bg)",
              borderRadius: 10,
              padding: "10px 10px",
              border: "1px solid var(--line)",
            }}
          >
            <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8 }}>
              {label}
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, marginTop: 3 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Speed chart preview */}
      <div>
        <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
          Speed
        </div>
        <svg viewBox="0 0 280 48" style={{ width: "100%", height: 48, display: "block" }}>
          <defs>
            <linearGradient id="mock-spd" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <polygon
            points="0,48 30,32 60,28 90,24 110,20 130,18 155,17 175,16 190,22 210,28 240,34 280,38 280,48"
            fill="url(#mock-spd)"
          />
          <polyline
            points="0,32 30,32 60,28 90,24 110,20 130,18 155,17 175,16 190,22 210,28 240,34 280,38"
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
