import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support — ImuaTrak",
  description: "Get help with ImuaTrak: FAQs, contact information, and troubleshooting for the paddling tracker app.",
};

export default function Support() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px", lineHeight: 1.7, color: "var(--ink, #1a1a1a)" }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>Support</h1>
      <p style={{ color: "var(--muted)", marginBottom: 40 }}>
        Help with the ImuaTrak app for iOS, Android, and Apple Watch.
      </p>

      <h2>Contact us</h2>
      <p>
        Email <a href="mailto:support@imuatrak.app">support@imuatrak.app</a> and we&rsquo;ll get back to you,
        usually within 1&ndash;2 business days. Please include your device model and app version
        (shown at the bottom of the <strong>Settings</strong> tab) so we can help faster.
      </p>

      <h2>Frequently asked questions</h2>

      <h3>How do I record a paddling session?</h3>
      <p>
        On the <strong>Home</strong> tab tap <strong>Record</strong>, grant location access when asked, and start
        paddling. ImuaTrak tracks your route, distance, pace, and stroke rate. Tap stop when you&rsquo;re
        done and the session is saved to your history.
      </p>

      <h3>Does recording keep working with the screen locked?</h3>
      <p>
        Yes. Once a session is running you can lock your phone or switch apps — GPS tracking continues
        in the background until you stop the session. On iOS you&rsquo;ll see the blue location indicator,
        and on Android a persistent &ldquo;ImuaTrak is recording&rdquo; notification, while tracking is active.
        Location is only recorded during an active session, never otherwise.
      </p>

      <h3>My route or distance looks wrong</h3>
      <ul>
        <li>Make sure Location access is granted with <strong>Precise Location</strong> enabled.</li>
        <li>Disable Low Power Mode / battery saver during long sessions — it can throttle GPS.</li>
        <li>GPS accuracy is reduced in the first minute after starting; wait for a fix before pushing off.</li>
      </ul>

      <h3>How does the Apple Watch app work?</h3>
      <p>
        Install ImuaTrak on your paired Apple Watch from the Watch app. You can start, pause, and stop
        workouts from the watch, see live heart rate and heart-rate zones, and say
        &ldquo;Start Paddling&rdquo; to Siri to begin. Workouts save to Apple Health.
      </p>

      <h3>How do I manage or cancel my subscription?</h3>
      <p>
        Subscriptions are billed through your app store and managed there, not inside ImuaTrak:
      </p>
      <ul>
        <li><strong>iOS:</strong> Settings → your name → Subscriptions → ImuaTrak+</li>
        <li><strong>Android:</strong> Play Store → profile → Payments &amp; subscriptions → Subscriptions</li>
      </ul>
      <p>
        To restore a purchase on a new device, open the paywall or Settings in the app and tap{" "}
        <strong>Restore Purchases</strong>.
      </p>

      <h3>How do I delete my account and data?</h3>
      <p>
        Email <a href="mailto:support@imuatrak.app">support@imuatrak.app</a> from the address linked to
        your account and we&rsquo;ll delete your account and all associated data. See our{" "}
        <a href="/privacy">Privacy Policy</a> for details on what we store.
      </p>

      <h3>Clubs: joining, posts, and events</h3>
      <p>
        Join a club with an invite link from a club admin. Club posts, chat, and event RSVPs are visible
        only to members of that club. Club admins can manage members and events from the club dashboard.
      </p>

      <h2>Legal</h2>
      <p>
        <a href="/privacy">Privacy Policy</a>
        {" · "}
        <a href="/terms">Terms of Use</a>
      </p>

      <h2>Still stuck?</h2>
      <p>
        <a href="mailto:support@imuatrak.app">support@imuatrak.app</a>
        <br />
        <a href="https://imuatrak.app">imuatrak.app</a>
      </p>
    </main>
  );
}
