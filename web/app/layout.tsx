import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import NavBar from "@/components/NavBar";

export const metadata: Metadata = {
  title: "ImuaTrak — paddling tracker for outrigger, dragon boat, surfski, SUP & V1",
  description:
    "Paddling tracker for iPhone & Apple Watch — free on the App Store, Android coming soon. GPS, stroke rate, splits, heart rate. Built for OC1, OC6, dragon boat, surfski, V1 and SUP. Imua — charge forward.",
  metadataBase: new URL("https://imuatrak.app"),
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
