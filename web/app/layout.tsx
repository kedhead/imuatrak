import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import NavBar from "@/components/NavBar";

const description =
  "Track every paddle and run your whole club. GPS, stroke rate, heart rate and splits, plus club calendar, RSVPs, boat lineups, chat, sign-up sheets and surveys. Free for outrigger, dragon boat, surfski, V1 and SUP on iPhone, Apple Watch and Android.";

export const metadata: Metadata = {
  title: "ImuaTrak — paddling tracker & club app for outrigger, dragon boat, surfski, SUP & V1",
  description,
  metadataBase: new URL("https://imuatrak.app"),
  applicationName: "ImuaTrak",
  appleWebApp: { title: "ImuaTrak" },
  itunes: { appId: "6774396124" },
  openGraph: {
    type: "website",
    siteName: "ImuaTrak",
    title: "ImuaTrak — track every paddle, run your whole club",
    description,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "ImuaTrak — track every paddle, run your whole club",
    description,
  },
};

/**
 * Applies the saved theme (or the system preference) before first paint so
 * light-mode users never see a dark flash. Runs synchronously as the first
 * thing in <body>; the NavBar toggle keeps localStorage + data-theme in sync.
 */
const themeBootScript = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.dataset.theme=t}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <NavBar />
        {children}
      </body>
    </html>
  );
}
