import type { Metadata, Viewport } from "next";
import { body, display } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nikhil & Sravanthi — Engagement Invitation",
  description:
    "An invitation to the engagement ceremony of Nikhil & Sravanthi, 30 August 2026.",
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
