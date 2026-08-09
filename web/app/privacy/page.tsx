import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — ImuaTrak",
  description: "ImuaTrak privacy policy",
};

export default function PrivacyPolicy() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px", lineHeight: 1.7, color: "var(--ink, #1a1a1a)" }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ color: "var(--muted)", marginBottom: 40 }}>Last updated: August 9, 2026</p>

      <h2>Overview</h2>
      <p>
        ImuaTrak (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) is a paddling training and club management app.
        This policy explains what data we collect, how we use it, and your rights.
      </p>

      <h2>Data We Collect</h2>

      <h3>Account data</h3>
      <p>
        Name and email address, provided when you sign in with Apple or with Google. We receive only what
        Apple or Google shares based on your privacy settings.
      </p>

      <h3>Location data</h3>
      <ul>
        <li>GPS route data recorded during paddling sessions</li>
        <li>Location is only recorded when you actively start a session</li>
        <li>Location data is stored on your device and synced to your private account</li>
      </ul>

      <h3>Fitness data</h3>
      <ul>
        <li>Motion data for stroke rate detection</li>
        <li>Workout metrics (distance, pace, duration) recorded during your sessions</li>
        <li>Fitness data is never shared with third parties</li>
      </ul>

      <h3>Club &amp; social data</h3>
      <p>
        Club membership, posts, chat messages, and event RSVPs you create. This content is visible to other members of your club.
      </p>

      <h3>Device data</h3>
      <p>
        Device push notification token (for club chat notifications, if you grant permission) and basic device information for crash reporting.
      </p>

      <h3>Usage data</h3>
      <p>
        In-app analytics collected by Google AdMob for free tier users. AdMob may use device identifiers for ad personalization subject to your device privacy settings.
      </p>

      <h2>How We Use Your Data</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid var(--line)" }}>
            <th style={{ textAlign: "left", padding: "8px 12px" }}>Data</th>
            <th style={{ textAlign: "left", padding: "8px 12px" }}>Purpose</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Account info", "Authentication and profile display"],
            ["Location & fitness", "Recording and displaying your session history"],
            ["Club content", "Sharing within your club"],
            ["Push tokens", "Delivering club chat notifications"],
            ["Ad data", "Showing relevant ads to free tier users"],
          ].map(([data, purpose]) => (
            <tr key={data} style={{ borderBottom: "1px solid var(--line)" }}>
              <td style={{ padding: "8px 12px" }}>{data}</td>
              <td style={{ padding: "8px 12px" }}>{purpose}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>We do not sell your personal data to any third party.</p>

      <h2>Third-Party Services</h2>
      <ul>
        <li><strong>Firebase (Google)</strong> — authentication, database, and file storage</li>
        <li><strong>Google AdMob</strong> — advertising for free tier users</li>
        <li><strong>RevenueCat</strong> — subscription and purchase management</li>
      </ul>
      <p>Each service operates under its own privacy policy.</p>

      <h2>Data Sharing</h2>
      <p>
        Your session data is <strong>private by default</strong>. You may choose to share individual sessions publicly via a share link.
        Club content (posts, messages, events) is visible only to club members.
      </p>
      <p>
        We do not share your personal data with third parties except as required to operate the services listed above.
      </p>

      <h2>Data Retention &amp; Deletion</h2>

      <h3>How long we keep your data</h3>
      <p>
        We retain the data described above for as long as your account exists. Your account data, sessions
        (including GPS routes and fitness metrics), and club content are not deleted automatically and have
        no fixed expiry date — we keep them so your training history stays available to you across devices.
        We delete them when you delete your account, as described below.
      </p>
      <p>Two exceptions expire on their own:</p>
      <ul>
        <li><strong>Club invite links</strong> expire 7 days after they are created.</li>
        <li>
          <strong>Session data cached on your device</strong> is removed when you uninstall the app or clear
          its storage through your device settings.
        </li>
      </ul>

      <h3>Deleting your account</h3>
      <p>
        You can delete your account and its data at any time from within the app, under{" "}
        <strong>Settings → Delete Account</strong>. You can also request deletion by emailing{" "}
        <a href="mailto:support@imuatrak.app">support@imuatrak.app</a>. Deletion is immediate and cannot be
        undone. It removes:
      </p>
      <ul>
        <li>Your profile and sign-in account</li>
        <li>All recorded sessions, including GPS routes and fitness metrics</li>
        <li>Any sessions you shared publicly, including their share links</li>
        <li>GPX files and share images stored in your account</li>
        <li>Push notification tokens and notification preferences</li>
        <li>Your membership in every club you belong to</li>
      </ul>
      <p>
        <strong>Club content is not removed by account deletion.</strong> Posts, chat messages, and event
        RSVPs you created remain visible to that club after you leave or delete your account, so the club&rsquo;s
        conversation history stays intact for its other members. If you want that content removed as well,
        email <a href="mailto:support@imuatrak.app">support@imuatrak.app</a> and we will delete it.
      </p>
      <p>
        We do not keep our own backup copies of your data, so deletion is permanent — we cannot restore an
        account once it has been deleted. Any residual copies held transiently within Google Cloud&rsquo;s
        infrastructure are removed under Google&rsquo;s own data deletion practices; they are not accessible
        through the app and we do not use them for any purpose.
      </p>

      <h2>Children&rsquo;s Privacy</h2>
      <p>
        ImuaTrak is not directed at children under 13. We do not knowingly collect data from children under 13.
      </p>

      <h2>Your Rights</h2>
      <p>
        Depending on your location you may have the right to access, correct, or delete your personal data.
        Contact us at <a href="mailto:support@imuatrak.app">support@imuatrak.app</a> to make a request.
      </p>

      <h2>Changes</h2>
      <p>
        We may update this policy. Continued use of the app after changes constitutes acceptance.
        Material changes will be notified in-app.
      </p>

      <h2>Contact</h2>
      <p>
        <a href="mailto:support@imuatrak.app">support@imuatrak.app</a>
        <br />
        <a href="https://imuatrak.app">imuatrak.app</a>
      </p>
    </main>
  );
}
