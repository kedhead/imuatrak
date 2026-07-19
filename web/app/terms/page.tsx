import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use — ImuaTrak",
  description: "Terms of use for the ImuaTrak app and website",
};

export default function Terms() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px", lineHeight: 1.7, color: "var(--ink, #1a1a1a)" }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>Terms of Use</h1>
      <p style={{ color: "var(--muted)", marginBottom: 40 }}>Last updated: July 10, 2026</p>

      <h2>The app</h2>
      <p>
        The ImuaTrak mobile app is licensed, not sold, to you. Use of the iOS app is governed by
        Apple&rsquo;s standard{" "}
        <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">
          Licensed Application End User License Agreement (EULA)
        </a>
        , and use of the Android app by the equivalent Google Play terms, together with the terms below.
      </p>

      <h2>Your account</h2>
      <p>
        You are responsible for activity that happens under your account. Keep your sign-in credentials
        secure. You must be at least 13 years old to use ImuaTrak.
      </p>

      <h2>Your content</h2>
      <p>
        You own the sessions, posts, and other content you create. By posting content to a club or
        publishing a session share link, you grant us the limited license needed to store and display
        that content to its intended audience. Don&rsquo;t post content that is unlawful, abusive, or that
        you don&rsquo;t have the right to share.
      </p>

      <h2>Subscriptions</h2>
      <p>
        Optional ImuaTrak+ subscriptions are billed through the App Store or Google Play and renew
        automatically until cancelled in your store account settings. Prices and terms are shown at the
        point of purchase.
      </p>

      <h2>Safety disclaimer</h2>
      <p>
        ImuaTrak is a training tracker, not a safety or navigation device. GPS data can be inaccurate or
        unavailable. Paddling involves inherent risk — always follow local water-safety rules, check
        conditions, and carry appropriate safety equipment. You use the app at your own risk.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Don&rsquo;t attempt to disrupt the service, access other users&rsquo; private data, or use the service in
        violation of applicable law. We may suspend accounts that violate these terms.
      </p>

      <h2>Warranty &amp; liability</h2>
      <p>
        The service is provided &ldquo;as is&rdquo; without warranties of any kind. To the maximum extent
        permitted by law, we are not liable for indirect or consequential damages arising from your use
        of the service.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms; material changes will be announced in-app or on this page. Continued
        use after changes constitutes acceptance.
      </p>

      <h2>Contact</h2>
      <p>
        <a href="mailto:support@imuatrak.app">support@imuatrak.app</a>
        <br />
        See also our <a href="/privacy">Privacy Policy</a> and <a href="/support">Support</a> page.
      </p>
    </main>
  );
}
