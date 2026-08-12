import type { Metadata, Viewport } from "next";
import { body, display } from "@/lib/fonts";
import { MESSAGE } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const TITLE = "Nikhil & Sravanthi — Engagement Invitation";

/* The invitation's own words, kept short enough to survive the two or three
   lines a chat preview actually shows before it truncates. */
const DESCRIPTION =
  `${MESSAGE.lines[0]} ${MESSAGE.lines[1]} ` +
  "Sunday, 30 August 2026 · 11:00 AM onwards · NBR Convention A/C, Hyderabad.";

export const metadata: Metadata = {
  // Link previews will not follow a relative og:image, and a static export has
  // no server to resolve one later — so the origin is baked in at build time.
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Nikhil & Sravanthi",
  openGraph: {
    type: "website",
    siteName: TITLE,
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    locale: "en_IN",
    images: [
      {
        url: "/og.jpg",
        width: 1200,
        height: 630,
        type: "image/jpeg",
        alt: "Nikhil & Sravanthi — engagement ceremony, 30 August 2026, NBR Convention, Hyderabad",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og.jpg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#05040a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
