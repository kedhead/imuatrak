import Link from "next/link";

const APP_STORE_URL = "https://apps.apple.com/us/app/imuatrak/id6774396124";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=app.imuatrak";

/*
 * Copy rule: only list what ships today. Keep this in step with the App
 * Store description in docs/app-store-submission.md, and with the paywall
 * gates in app/paywall.tsx for what's free vs paid.
 */

const CRAFTS = ["OC1", "OC2", "OC6", "V1", "SUP", "Surfski", "Dragon boat 10", "Dragon boat 20"];

const TRACK: Feature[] = [
  { icon: "📍", title: "GPS, pace & splits", body: "Distance, speed, pace and splits, with your route on a map. Pace uses moving time, so a rest stop doesn't wreck your average." },
  { icon: "〽️", title: "Real stroke rate", body: "Stroke rate from your phone's motion sensors, filtered so that chop and swell don't count as strokes." },
  { icon: "❤️", title: "Heart rate & zones", body: "Pair a Bluetooth chest strap such as a Garmin HRM, Polar H9/H10 or Wahoo. You get live heart rate and time in each zone afterwards." },
  { icon: "⌚", title: "Apple Watch app", body: "Record from your wrist with live heart rate. Sessions sync to your iPhone and save to Apple Health." },
  { icon: "🌤️", title: "Conditions saved", body: "Each session saves the weather along with your numbers, so you know which paddle was the windy one." },
  { icon: "🏆", title: "Stats, PBs & goals", body: "Lifetime totals, personal bests and a weekly distance goal to keep you heading out." },
  { icon: "🔁", title: "GPX in and out", body: "Export to Strava, Garmin Connect and others, or import a GPX from another watch." },
  { icon: "📡", title: "Works off the grid", body: "Records with no signal and syncs once you're back in range. You can record before you even make an account." },
];

const CLUB: Feature[] = [
  { icon: "📅", title: "Calendar & RSVPs", body: "Practices, races and socials with going, maybe or no RSVPs, guest paddlers and reminders. Bulk-schedule a whole season." },
  { icon: "🛶", title: "Boat lineups", body: "Seat your crew in OC1 through OC6 and dragon boats for every event, so everyone knows their seat before they reach the beach." },
  { icon: "📝", title: "Sign-up sheets", isNew: true, body: "Potlucks, race-day gear, volunteers. Start from a template, and people claim a slot in one tap." },
  { icon: "📋", title: "Surveys", isNew: true, body: "End-of-season feedback, race debriefs or picking practice times. You can make them anonymous, and results add up as answers arrive." },
  { icon: "📣", title: "Team feed", body: "Announcements, posts and polls, with likes and comments. You can attach a session to a post." },
  { icon: "💬", title: "Club chat", body: "Public and private channels with photos, video, reactions, @mentions, pinned messages and push notifications." },
  { icon: "✉️", title: "Direct messages & group chats", isNew: true, body: "Message a teammate, or start a group chat for a crew, a carpool or a race team. Only the people in it can see it." },
  { icon: "👥", title: "Roster & profiles", body: "Member profiles, roles for owner, admin and coach, and birthday shout-outs. Invite people with a link or a QR code." },
  { icon: "🗓️", title: "Calendar feed", body: "Show your club schedule on your own website, or subscribe to it from Google or Apple Calendar." },
  { icon: "🔀", title: "More than one club", body: "Paddle with two clubs? Belong to both and switch between them in a tap." },
];

export default function Landing() {
  return (
    <main className="lp">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-wrap lp-hero-grid">
          <div>
            <p className="lp-eyebrow">Imua: charge forward</p>
            <h1>
              Track every paddle.
              <br />
              <span className="lp-accent">Run your whole club.</span>
            </h1>
            <p className="lp-lede">
              ImuaTrak is made by paddlers for outrigger, dragon boat, surfski, V1 and SUP. It
              covers GPS, stroke rate and heart rate on the water, and the calendar, lineups,
              chat and sign-ups your club runs on.
            </p>
            <StoreButtons />
            <p className="lp-note">Free on iPhone, Apple Watch and Android, and your whole club can use it free.</p>
            <div className="lp-crafts" aria-label="Supported craft">
              {CRAFTS.map((c) => (
                <span key={c} className="lp-chip">
                  {c}
                </span>
              ))}
            </div>
          </div>
          <MockSession />
        </div>
      </section>

      {/* ── Track ────────────────────────────────────────────── */}
      <section id="track" className="lp-section">
        <div className="lp-wrap">
          <div className="lp-head">
            <p className="lp-eyebrow">Track your paddles · free</p>
            <h2>Built for boats with outriggers, not &ldquo;Kayak (Other)&rdquo;.</h2>
            <p>
              Each craft has its own defaults. Start recording at the put-in and look over
              the whole session when you&apos;re back on the beach.
            </p>
          </div>
          <FeatureGrid items={TRACK} />
        </div>
      </section>

      {/* ── Club ─────────────────────────────────────────────── */}
      <section id="clubs" className="lp-section lp-section-alt">
        <div className="lp-wrap">
          <div className="lp-head">
            <p className="lp-eyebrow">Run your club · free</p>
            <h2>The group chat, the spreadsheet and the whiteboard, in one place.</h2>
            <p>
              Create a club and share the invite link. The schedule, the crews, the chat and the
              potluck list all live in the same app as everyone&apos;s training.
            </p>
          </div>
          <FeatureGrid items={CLUB} />
        </div>
      </section>

      {/* ── Share + web ──────────────────────────────────────── */}
      <section className="lp-section">
        <div className="lp-wrap lp-split">
          <div>
            <p className="lp-eyebrow">Share any session</p>
            <h2>One link, and anyone can see your paddle.</h2>
            <p className="lp-lede" style={{ marginBottom: 20 }}>
              Turn on sharing and a session gets its own page with the route map, speed chart
              and splits. Paste it into the club chat. Nobody needs an account to open it.
            </p>
            <code className="lp-chip" style={{ fontSize: 13, color: "var(--aqua)" }}>
              imuatrak.app/s/…
            </code>
          </div>
          <div className="lp-feature" style={{ padding: 28 }}>
            <p className="lp-eyebrow" style={{ marginBottom: 14 }}>Also on the web</p>
            <ul className="lp-checks">
              <li><span><b>Your sessions</b> with maps, charts and heart rate zones on a big screen</span></li>
              <li><span><b>Club chat, feed and messages</b> from your laptop</span></li>
              <li><span><b>Calendar, members and gallery</b> for admins, no phone needed</span></li>
            </ul>
            <Link href="/login" className="btn" style={{ marginTop: 20 }}>
              Sign in on the web
            </Link>
          </div>
        </div>
      </section>

      {/* ── Plans ────────────────────────────────────────────── */}
      <section id="plans" className="lp-section lp-section-alt">
        <div className="lp-wrap">
          <div className="lp-head">
            <p className="lp-eyebrow">Plans</p>
            <h2>Free to paddle. Upgrade if you want to.</h2>
            <p>
              Tracking and everyday club tools are free for everyone. Paid plans remove ads and
              add messaging. One Club plan covers every member.
            </p>
          </div>
          <div className="lp-plans">
            <Plan
              name="Free"
              price="$0"
              sub="Everything you need to track paddles and run a club."
              items={[
                "GPS, stroke rate, heart rate and splits",
                "Apple Watch app with Apple Health",
                "Clubs, calendar, RSVPs and lineups",
                "Sign-up sheets, surveys, feed and chat",
                "GPX export and shareable links",
              ]}
            />
            <Plan
              name="ImuaTrak+"
              price="$1.99"
              per="/mo"
              alt="or $19.99/yr"
              sub="For you on your own."
              items={["No ads anywhere in the app", "Message any paddler in your club", "Support an independent paddling app"]}
            />
            <Plan
              hot
              name="Club plan"
              price="$9.99"
              per="/mo"
              alt="or $99.99/yr · 7-day free trial"
              sub="One subscription for the whole club."
              items={[
                "No ads for every member",
                "Everyone can message each other",
                "Private group chats for crews and carpools",
                "Unlimited public and private channels",
                "Club photo gallery with hashtags and tagging",
              ]}
            />
          </div>
          <p className="lp-fine">
            These are US prices. The app shows the price in your currency before you buy.
            Subscriptions renew automatically, and you can cancel any time from your App Store
            or Google Play settings.
          </p>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <section id="faq" className="lp-section">
        <div className="lp-wrap">
          <div className="lp-head">
            <p className="lp-eyebrow">FAQ</p>
            <h2>Good questions from the beach.</h2>
          </div>
          <div className="lp-faq">
            <Faq q="Is it really free?">
              Yes. Recording, stats, clubs, the calendar, lineups, chat, sign-up sheets and
              surveys are all free. Paid plans remove ads and add direct messages, group chats,
              extra channels and the club gallery.
            </Faq>
            <Faq q="Do I need a watch or a heart rate strap?">
              No. Your phone records GPS and stroke rate on its own. For heart rate, use the
              Apple Watch app, or pair a Bluetooth chest strap such as a Garmin HRM-Dual or
              HRM-Pro, Polar H9 or H10, or Wahoo TICKR. Straps that only use ANT+ won&apos;t
              connect.
            </Faq>
            <Faq q="Does it work without signal?">
              Yes. Recording doesn&apos;t need a connection. Sessions save on your phone and
              sync when you&apos;re back in range.
            </Faq>
            <Faq q="Can I get my sessions into Strava or Garmin Connect?">
              Every session exports as GPX, and Strava, Garmin Connect and most training apps
              import GPX. You can also bring in a GPX recorded on another device.
            </Faq>
            <Faq q="Is there an Android watch app?">
              Not yet. The watch app is Apple Watch only for now. On Android, record with your
              phone and a Bluetooth heart rate strap.
            </Faq>
            <Faq q="How does the Club plan work?">
              One person subscribes for the club, and every member gets the benefits: no ads,
              messaging, group chats, unlimited channels and the photo gallery. You can try it
              free for 7 days. If the plan lapses, existing group chats keep working.
            </Faq>
            <Faq q="Can club admins read my group chats or DMs?">
              No. Direct messages and group chats can only be seen by the people in them. An
              admin can see one only if they&apos;ve been added to it.
            </Faq>
            <Faq q="Can I be in more than one club?">
              Yes. Join as many clubs as you paddle with and switch between them in a tap.
            </Faq>
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────── */}
      <div className="lp-wrap">
        <section id="download" className="lp-final">
          <p className="lp-eyebrow" style={{ color: "#bff3f0" }}>Out now</p>
          <h2>Get your crew on ImuaTrak.</h2>
          <p style={{ margin: "0 0 24px" }}>Free on the App Store and Google Play.</p>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <StoreButtons />
          </div>
          <p style={{ fontSize: 14, margin: "20px 0 0" }}>
            Questions? Email{" "}
            <a href="mailto:support@imuatrak.app" style={{ color: "#fff" }}>
              support@imuatrak.app
            </a>
          </p>
        </section>

        <footer className="lp-footer">
          <span>© {new Date().getFullYear()} ImuaTrak · Made by paddlers</span>
          <span style={{ display: "flex", gap: 16 }}>
            <a href="#plans">Plans</a>
            <a href="#faq">FAQ</a>
            <Link href="/support">Support</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </span>
        </footer>
      </div>
    </main>
  );
}

type Feature = { icon: string; title: string; body: string; isNew?: boolean };

function FeatureGrid({ items }: { items: Feature[] }) {
  return (
    <div className="lp-grid">
      {items.map((f) => (
        <div key={f.title} className="lp-feature">
          <div className="lp-feature-icon" aria-hidden>
            {f.icon}
          </div>
          <h3>
            {f.title}
            {f.isNew && <span className="lp-new">New</span>}
          </h3>
          <p>{f.body}</p>
        </div>
      ))}
    </div>
  );
}

function StoreButtons() {
  return (
    <div className="lp-cta-row">
      <a className="lp-store" href={APP_STORE_URL}>
        <AppleGlyph />
        <span>
          <small>Download on the</small>App Store
        </span>
      </a>
      <a className="lp-store" href={PLAY_STORE_URL}>
        <PlayGlyph />
        <span>
          <small>Get it on</small>Google Play
        </span>
      </a>
    </div>
  );
}

function Plan({
  name,
  price,
  per,
  alt,
  sub,
  items,
  hot,
}: {
  name: string;
  price: string;
  per?: string;
  alt?: string;
  sub: string;
  items: string[];
  hot?: boolean;
}) {
  return (
    <div className={hot ? "lp-plan lp-plan-hot" : "lp-plan"}>
      {hot && <span className="lp-plan-tag">Best for clubs</span>}
      <h3>{name}</h3>
      <div>
        <div className="lp-price">
          {price}
          {per && <span>{per}</span>}
        </div>
        {alt && <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{alt}</div>}
      </div>
      <p className="lp-sub">{sub}</p>
      <ul className="lp-checks">
        {items.map((i) => (
          <li key={i}>
            <span>{i}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details>
      <summary>{q}</summary>
      <p>{children}</p>
    </details>
  );
}

function AppleGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.37 12.6c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.62-1.7-3.19-1.72-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.62 1.11 8.79.73 1.06 1.6 2.25 2.75 2.2 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.71.71 2.88.69 1.19-.02 1.94-1.08 2.66-2.14.84-1.23 1.19-2.42 1.21-2.48-.03-.01-2.32-.89-2.34-3.53zM14.18 6.14c.61-.74 1.02-1.76.91-2.78-.88.04-1.94.59-2.57 1.32-.56.65-1.06 1.69-.92 2.69.98.08 1.97-.5 2.58-1.23z" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4.2 2.3c-.3.2-.5.6-.5 1.1v17.2c0 .5.2.9.5 1.1L13.9 12 4.2 2.3zm11.1 8.3L6.2 1.6l10.6 6.1-1.5 2.9zm0 2.8 1.5 2.9-10.6 6.1 9.1-9zm4.4-2.8-2.4-1.4-1.7 2.8 1.7 2.8 2.4-1.4c.8-.5.8-1.9 0-2.8z" />
    </svg>
  );
}

/** Static mock of a recorded session plus a club event card. */
function MockSession() {
  return (
    <div aria-hidden>
      <div className="lp-mock">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 1, textTransform: "uppercase" }}>
            Sat · 6:42 AM · Light trades
          </span>
          <span className="lp-chip" style={{ padding: "3px 10px" }}>OC1</span>
        </div>
        <div style={{ fontSize: 26, fontWeight: 850, marginBottom: 2 }}>Kaimana loop</div>
        <div style={{ color: "var(--muted)", marginBottom: 14 }}>12.40 km · 1:18:32 · 6:20 /km</div>

        <div
          style={{
            height: 130,
            borderRadius: 14,
            overflow: "hidden",
            background: "var(--map-bg)",
            marginBottom: 14,
            border: "1px solid var(--line)",
          }}
        >
          <svg viewBox="0 0 280 130" style={{ width: "100%", height: "100%" }}>
            <path d="M0,104 C40,96 70,112 110,100 S190,92 280,106 L280,130 L0,130 Z" fill="var(--aqua)" opacity="0.10" />
            <polyline
              points="30,100 55,84 82,72 108,60 135,52 160,46 186,44 206,50 226,60 246,72 236,88 210,96 170,98 120,102 70,104 30,100"
              fill="none"
              stroke="var(--aqua)"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle cx="30" cy="100" r="5" fill="var(--success)" />
            <circle cx="246" cy="72" r="4" fill="var(--gold)" />
          </svg>
        </div>

        <div className="lp-mock-stats">
          {[
            ["Stroke rate", "62 spm"],
            ["Avg HR", "148 bpm"],
            ["Max speed", "14.2 km/h"],
          ].map(([label, value]) => (
            <div key={label} className="lp-mock-stat">
              <div>{label}</div>
              <div>{value}</div>
            </div>
          ))}
        </div>

        <svg viewBox="0 0 280 44" style={{ width: "100%", height: 44, display: "block" }}>
          <defs>
            <linearGradient id="mock-spd" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--aqua)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--aqua)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <polygon points="0,44 0,30 30,26 60,22 90,20 110,16 130,14 155,15 175,12 190,18 210,22 240,26 280,30 280,44" fill="url(#mock-spd)" />
          <polyline
            points="0,30 30,26 60,22 90,20 110,16 130,14 155,15 175,12 190,18 210,22 240,26 280,30"
            fill="none"
            stroke="var(--aqua)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="lp-float">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--coral)", fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase" }}>
              Tomorrow · 5:30 PM
            </div>
            <div style={{ fontWeight: 800, fontSize: 15, marginTop: 2 }}>OC6 practice + potluck</div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>14 going · 2 boats seated · 9/12 dishes claimed</div>
          </div>
          <span
            style={{
              background: "var(--success)",
              color: "#fff",
              fontSize: 12,
              fontWeight: 800,
              padding: "6px 12px",
              borderRadius: 999,
              whiteSpace: "nowrap",
            }}
          >
            Going ✓
          </span>
        </div>
      </div>
    </div>
  );
}
