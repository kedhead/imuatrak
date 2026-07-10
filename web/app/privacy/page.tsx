import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — ImuaTrak",
  description: "ImuaTrak privacy policy",
};

export default function PrivacyPolicy() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px", lineHeight: 1.7, color: "var(--ink, #1a1a1a)" }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ color: "#666", marginBottom: 40 }}>Last updated: June 8, 2026</p>

      <h2>Overview</h2>
      <p>
        ImuaTrak (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) is a paddling training and club management app.
        This policy explains what data we collect, how we use it, and your rights.
      </p>

      <h2>Data We Collect</h2>

      <h3>Account data</h3>
      <p>
        Name and email address via Apple Sign In. We receive only what Apple shares based on your privacy settings.
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
          <tr style={{ borderBottom: "2px solid #eee" }}>
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
            <tr key={data} style={{ borderBottom: "1px solid #eee" }}>
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
      <p>
        You may delete your account and all associated data at any time by contacting us at{" "}
        <a href="mailto:support@imuatrak.app">support@imuatrak.app</a>. Club content you authored will be removed.
        Location and fitness data stored on your device is controlled by you through your device settings.
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
