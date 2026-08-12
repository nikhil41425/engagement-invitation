/**
 * The absolute origin the page is served from.
 *
 * Link previews (WhatsApp, iMessage, Slack, Twitter) will not follow a relative
 * og:image — the URL has to be absolute, and it has to be baked in at build
 * time because this is a static export with no server to fill it in later.
 *
 * On Vercel this resolves itself from the project's production domain. Set
 * NEXT_PUBLIC_SITE_URL to override it, which is what a custom domain needs.
 */
const fromVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : undefined;

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? fromVercel ?? "http://localhost:3000";
