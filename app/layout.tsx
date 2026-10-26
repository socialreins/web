import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Atkinson_Hyperlegible_Next, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });
const body = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-atkinson" });

export const metadata: Metadata = {
  metadataBase: new URL("https://socialreins.com"),
  title: "SocialReins: open-source social media manager",
  description:
    "Publish and schedule to Facebook Pages, Instagram, Threads, LinkedIn, Bluesky and X from one place. Self-hosting is coming. Join the waitlist for the hosted version.",
};

export const viewport: Viewport = { themeColor: "#17352a" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
