import Link from "next/link";

export default function Landing() {
  return (
    <main className="container">
      <header style={{ marginBottom: 64 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>Paddleup</div>
      </header>

      <section style={{ marginBottom: 80 }}>
        <h1 style={{ fontSize: 56, lineHeight: 1.05, margin: 0, fontWeight: 800 }}>
          A paddling tracker that<br />actually knows what a stroke is.
        </h1>
        <p style={{ fontSize: 20, color: "var(--muted)", marginTop: 24, maxWidth: 640 }}>
          Phone-only GPS, real stroke detection from the IMU, splits, and heart rate
          from your watch. Built for outrigger, surfski, V1 and SUP — not running with a
          paddle name.
        </p>
        <div style={{ marginTop: 32, display: "flex", gap: 12 }}>
          <a className="btn" href="#download">Get the app</a>
          <a className="btn btn-outline" href="#features">See features</a>
        </div>
      </section>

      <section id="features" style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <Feature title="Real stroke detection">
          Counts strokes from phone IMU using cadence + dominant-axis oscillation. No magic
          numbers — handles waves, cars, and bumps.
        </Feature>
        <Feature title="GPS that handles canyons">
          Kalman-smoothed track with accuracy-aware speed. Splits every 1 km, moving-time
          aware so a coffee break doesn't tank your pace.
        </Feature>
        <Feature title="Heart rate from your watch">
          Apple Health on iOS, Health Connect on Android. We pull HR samples and zone-time
          for the session window — no second app to babysit.
        </Feature>
        <Feature title="GPX + shareable links">
          Every session exports clean GPX. Flip a switch to publish a public link
          (paddleup.app/s/…) you can drop in a club chat.
        </Feature>
        <Feature title="Crafts that exist">
          OC1 / OC2 / OC6 / V1 / SUP / Surfski — different defaults for different boats.
          Not "Kayak (Other)".
        </Feature>
        <Feature title="Built for the offline put-in">
          Records fully offline. Uploads when you're back on signal. Your data sits in
          your account, not behind a paywall.
        </Feature>
      </section>

      <section id="download" style={{ marginTop: 96, textAlign: "center" }}>
        <h2 style={{ fontSize: 32, margin: 0 }}>Coming soon to iOS &amp; Android</h2>
        <p className="muted" style={{ marginTop: 12 }}>
          TestFlight + Play Internal Testing this season. Email{" "}
          <a href="mailto:hello@paddleup.app" style={{ color: "var(--blue-bright)" }}>
            hello@paddleup.app
          </a>{" "}
          to get on the list.
        </p>
      </section>

      <footer style={{ marginTop: 96, paddingTop: 24, borderTop: "1px solid var(--line)", color: "var(--muted)", fontSize: 13, display: "flex", justifyContent: "space-between" }}>
        <span>© Paddleup</span>
        <span>
          <Link href="/privacy">Privacy</Link>
          {" · "}
          <Link href="/terms">Terms</Link>
        </span>
      </footer>
    </main>
  );
}

function Feature({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{title}</div>
      <div style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}
