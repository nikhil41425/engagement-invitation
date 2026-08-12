/**
 * Every word that appears in the invitation, in one place, so the 3D panels and
 * the no-WebGL fallback can never drift apart.
 */

export const DIRECTIONS_URL = "https://share.google/u1rHnw8wfH0q3O7x1";

export const COUPLE = {
  him: { name: "Nikhil", parents: "S/o Are Srinivas & Manjula" },
  her: { name: "Sravanthi", parents: "D/o Pandula Narsimha & Madhavi" },
} as const;

export const EVENT = {
  kind: "ENGAGEMENT CEREMONY",
  dateLine: "30 • 08 • 2026",
  day: "30",
  month: "AUGUST",
  year: "2026",
  weekday: "SUNDAY",
  time: "11:00 AM onwards",
} as const;

export const VENUE = {
  name: "NBR CONVENTION",
  qualifier: "A / C",
  address: [
    "8H67+7RX, Main Road, Nagarjuna Sagar Rd,",
    "Sripuram, B.N Reddy Nagar,",
    "Hyderabad, Telangana 500112",
  ],
  cta: "GET DIRECTIONS",
} as const;

export const MESSAGE = {
  heading: "A NEW CHAPTER BEGINS",
  lines: [
    "“We would be honored by your presence",
    "as we begin this beautiful chapter together.”",
  ],
  signature: "Nikhil & Sravanthi",
} as const;

/**
 * The object turns on its vertical axis only, so it presents four faces — the
 * four sides of the ring. Nothing is dropped to fit: the couple and families
 * chapters always carried the same names and parents, so they are one panel,
 * and the closing message joins the welcome face it belongs with.
 *
 * `slot` is the BoxGeometry material index: 0 +X right, 1 -X left, 2 +Y top,
 * 3 -Y bottom, 4 +Z front, 5 -Z back. Swiping left runs the ring forward.
 */
export const FACE_ORDER = [
  { key: "welcome", slot: 4, title: "WELCOME" },
  { key: "couple", slot: 0, title: "OUR FAMILIES" },
  { key: "date", slot: 5, title: "SAVE THE DATE" },
  { key: "venue", slot: 1, title: "THE VENUE" },
] as const;

/** slots reached by a quarter turn each, in ring order from the front */
export const RING_SLOTS = [4, 0, 5, 1] as const;
/** the lid and the base are never turned toward the viewer */
export const BLANK_SLOTS = [2, 3] as const;

export const VENUE_SLOT = 1;
export const MESSAGE_FACE_INDEX = 0;

export type FaceKey = (typeof FACE_ORDER)[number]["key"];
