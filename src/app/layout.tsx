import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIR BASKETBALL — Gesture Controlled Arcade Hoops",
  description:
    "Grab. Aim. Shoot. Score! A single-player, camera-controlled basketball game that works fully offline: pinch to grab the ball, pull back to charge and throw with your hand. Top 10 leaderboard saved on the device.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/brand/air-basketball-logo.png", apple: "/brand/air-basketball-logo.png" },
  appleWebApp: { capable: true, title: "Air Basketball", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#04070f",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#04070f] text-white antialiased">{children}</body>
    </html>
  );
}
