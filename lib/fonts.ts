import { Cinzel, Cormorant_Garamond } from "next/font/google";

/**
 * Self-hosted at build time by next/font: no runtime request to Google, no
 * extra connections on a phone network, and the exact files are pinned in the
 * build. The resolved family names are handed to the canvas panel renderer.
 */
export const display = Cinzel({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-display",
});

export const body = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-body",
});
