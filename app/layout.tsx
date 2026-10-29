import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { Atkinson_Hyperlegible_Next, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });
const body = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-atkinson" });

export const metadata: Metadata = {
  metadataBase: new URL("https://socialreins.com"),
  title: "SocialReins: open-source social media manager",
  description:
    "Publish and schedule to Facebook, Instagram, Threads, LinkedIn, Bluesky, X, TikTok and YouTube from one place. Open source and self-hostable, with a hosted version coming.",
};

export const viewport: Viewport = { themeColor: "#121212" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <Script src="/config.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
