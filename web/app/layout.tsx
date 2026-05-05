import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";

export const metadata: Metadata = {
  title: "ImuaTrak — paddling tracker for outrigger, surfski, SUP & V1",
  description:
    "Phone-only paddling tracker. GPS, stroke rate, splits, heart rate. Built for OC1, OC6, surfski, V1 and SUP. Imua — charge forward.",
  metadataBase: new URL("https://imuatrak.app"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
