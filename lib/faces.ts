/**
 * The six panel artworks, drawn to canvases and used as both `map` and
 * `emissiveMap` so the gold type genuinely glows.
 *
 * Layout is authored on a 1024 grid and rendered at `tex` texels (U converts
 * between the two), so the panels can be drawn at whatever resolution the
 * device can afford without a single coordinate moving.
 */

import { COUPLE, EVENT, MESSAGE, VENUE } from "./content";

export interface Fonts {
  /** resolved family name for Cinzel (display) */
  display: string;
  /** resolved family name for Cormorant Garamond (body) */
  body: string;
}

export const GRID = 1024;

const GOLD = "#eec98a";
const INK = "#07060d";
const C_GOLD = "rgba(238,201,138,.92)";
const C_WARM = "rgba(248,229,192,.96)";

const ACCENT: Record<string, [number, number, number]> = {
  wine: [126, 26, 52],
  violet: [86, 42, 132],
  indigo: [40, 48, 122],
  plum: [104, 34, 96],
};

/** The pill on the venue face, in grid units. The uv rect drives the hit test. */
export const PILL = { x: 288, y: 726, w: 448, h: 104, r: 52 };
export const PILL_UV = {
  u0: PILL.x / GRID,
  u1: (PILL.x + PILL.w) / GRID,
  v0: 1 - (PILL.y + PILL.h) / GRID,
  v1: 1 - PILL.y / GRID,
};

type Ctx = CanvasRenderingContext2D;

/** One drawing session against a single panel canvas. */
class Panel {
  readonly ctx: Ctx;
  readonly canvas: HTMLCanvasElement;
  readonly S: number;
  readonly U: number;
  readonly rim: number;
  readonly inset: number;
  readonly maxW: number;
  private fonts: Fonts;

  constructor(tex: number, fonts: Fonts) {
    const c = document.createElement("canvas");
    c.width = c.height = tex;
    this.canvas = c;
    this.ctx = c.getContext("2d")!;
    this.S = tex;
    this.U = tex / GRID;
    this.rim = 78 * this.U;
    this.inset = 104 * this.U;
    this.maxW = GRID - 104 * 2 - 52;
    this.fonts = fonts;
  }

  private cinzel(weight: string) {
    return (s: number) => `${weight} ${s * this.U}px ${this.fonts.display}, Georgia, serif`;
  }

  private cormorant(weight: string, italic?: boolean) {
    return (s: number) =>
      `${italic ? "italic " : ""}${weight} ${s * this.U}px ${this.fonts.body}, Georgia, serif`;
  }

  /** manual letter-spacing: measure each glyph, advance by width + spacing */
  private tracked(text: string, cx: number, y: number, spacing: number) {
    const ctx = this.ctx;
    const chars = Array.from(text);
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
    let x = cx - total / 2;
    const prev = ctx.textAlign;
    ctx.textAlign = "left";
    for (let i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], x, y);
      x += widths[i] + spacing;
    }
    ctx.textAlign = prev;
    return total;
  }

  private measure(text: string, spacing: number) {
    const ctx = this.ctx;
    const chars = Array.from(text);
    let t = 0;
    for (const ch of chars) t += ctx.measureText(ch).width;
    return t + spacing * Math.max(0, chars.length - 1);
  }

  /** shrink size and spacing together until the line clears the hairline frame */
  private fit(text: string, spacing: number, size: number, font: (s: number) => string, maxW?: number) {
    this.ctx.font = font(size);
    const w = this.measure(text, spacing) / this.U;
    const lim = maxW ?? this.maxW;
    if (w > lim) {
      const k = lim / w;
      size *= k;
      spacing *= k;
      this.ctx.font = font(size);
    }
    return { size, spacing };
  }

  /**
   * A blurred pass for the halo, then a crisp pass on top. The glow sits behind
   * the glyphs instead of eating their edges — this is what keeps type sharp.
   */
  private ink(text: string, y: number, spacing: number, fill: string | CanvasGradient, glow?: string, blur = 0) {
    const ctx = this.ctx;
    const py = y * this.U;
    if (glow && blur) {
      ctx.save();
      ctx.shadowColor = glow;
      ctx.shadowBlur = blur * this.U;
      ctx.fillStyle = fill;
      this.tracked(text, this.S / 2, py, spacing);
      ctx.restore();
    }
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = fill;
    this.tracked(text, this.S / 2, py, spacing);
    ctx.restore();
  }

  private goldGrad(y: number, size: number) {
    const g = this.ctx.createLinearGradient(0, y - size * 0.82, 0, y + size * 0.18);
    g.addColorStop(0, "#fffaf1");
    g.addColorStop(0.52, "#f6dfb2");
    g.addColorStop(1, "#e0b978");
    return g;
  }

  // ---- public drawing vocabulary, all in grid units ----

  base(accent: keyof typeof ACCENT | string, poolY: number, poolW: number, poolH: number) {
    const ctx = this.ctx;
    const S = this.S;
    const a = ACCENT[accent] ?? ACCENT.violet;
    const py = poolY * this.U;
    const pw = poolW * this.U;
    const ph = poolH * this.U;

    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, S, S);

    // one soft pool of coloured light, behind the type block only
    const g = ctx.createRadialGradient(S / 2, py, 10, S / 2, py, Math.max(pw, ph));
    g.addColorStop(0, `rgba(${a[0]},${a[1]},${a[2]},.52)`);
    g.addColorStop(0.45, `rgba(${a[0]},${a[1]},${a[2]},.22)`);
    g.addColorStop(1, `rgba(${a[0]},${a[1]},${a[2]},0)`);
    ctx.save();
    ctx.translate(S / 2, py);
    ctx.scale(1, ph / pw);
    ctx.translate(-S / 2, -py);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S * 2);
    ctx.restore();

    // faint diagonal sheen
    const sh = ctx.createLinearGradient(0, S, S, 0);
    sh.addColorStop(0, "rgba(255,255,255,0)");
    sh.addColorStop(0.46, "rgba(255,244,224,.045)");
    sh.addColorStop(0.58, "rgba(255,244,224,.012)");
    sh.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sh;
    ctx.fillRect(0, 0, S, S);

    // strong vignette
    const vg = ctx.createRadialGradient(S / 2, S / 2, S * 0.24, S / 2, S / 2, S * 0.76);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(0.62, "rgba(0,0,0,.42)");
    vg.addColorStop(1, "rgba(3,2,6,.94)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, S, S);
  }

  /** machined edge: bright chamfer at the physical edge, falling to a dark reveal */
  edges() {
    const ctx = this.ctx;
    const S = this.S;
    const R = this.rim;
    const sides: [number, number, number, number, number, number, number, number][] = [
      [0, 0, S, R, 0, 0, 0, R],
      [0, S - R, S, R, 0, S, 0, S - R],
      [0, 0, R, S, 0, 0, R, 0],
      [S - R, 0, R, S, S, 0, S - R, 0],
    ];
    for (const s of sides) {
      const g = ctx.createLinearGradient(s[4], s[5], s[6], s[7]);
      g.addColorStop(0.0, "rgba(255,247,228,.92)");
      g.addColorStop(0.05, "rgba(228,190,130,.66)");
      g.addColorStop(0.14, "rgba(146,108,60,.44)");
      g.addColorStop(0.34, "rgba(74,54,32,.30)");
      g.addColorStop(0.58, "rgba(120,90,52,.22)");
      g.addColorStop(0.8, "rgba(34,25,18,.22)");
      g.addColorStop(0.93, "rgba(10,8,16,.60)");
      g.addColorStop(1.0, "rgba(8,6,14,.20)");
      ctx.fillStyle = g;
      ctx.fillRect(s[0], s[1], s[2], s[3]);
    }
    const o = Math.round(this.inset) + 0.5;
    ctx.strokeStyle = "rgba(232,196,136,.5)";
    ctx.lineWidth = Math.max(1, Math.round(1.4 * this.U));
    ctx.strokeRect(o, o, S - o * 2, S - o * 2);
  }

  rule(cx: number, y: number, w: number, alpha = 0.62) {
    const ctx = this.ctx;
    const x = cx * this.U;
    const py = y * this.U;
    const pw = w * this.U;
    const g = ctx.createLinearGradient(x - pw / 2, 0, x + pw / 2, 0);
    g.addColorStop(0, "rgba(238,201,138,0)");
    g.addColorStop(0.5, `rgba(238,201,138,${alpha})`);
    g.addColorStop(1, "rgba(238,201,138,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - pw / 2, py, pw, 1.5 * this.U);
  }

  ornament(cx: number, y: number, w: number) {
    this.rule(cx - w / 4 - 16, y, w / 2, 0.5);
    this.rule(cx + w / 4 + 16, y, w / 2, 0.5);
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = "rgba(238,201,138,.75)";
    ctx.shadowBlur = 10 * this.U;
    ctx.translate(cx * this.U, (y + 1) * this.U);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "rgba(238,201,138,.92)";
    const r = 4 * this.U;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }

  sparkle(cx: number, cy: number, r: number, alpha = 0.95) {
    const ctx = this.ctx;
    let rr = r * this.U;
    ctx.save();
    ctx.translate(cx * this.U, cy * this.U);
    ctx.fillStyle = `rgba(255,240,210,${alpha})`;
    ctx.shadowColor = "rgba(238,201,138,.9)";
    ctx.shadowBlur = rr * 1.6;
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      ctx.moveTo(0, -rr);
      ctx.quadraticCurveTo(rr * 0.13, -rr * 0.13, rr, 0);
      ctx.quadraticCurveTo(rr * 0.13, rr * 0.13, 0, rr);
      ctx.quadraticCurveTo(-rr * 0.13, rr * 0.13, -rr, 0);
      ctx.quadraticCurveTo(-rr * 0.13, -rr * 0.13, 0, -rr);
      ctx.fill();
      ctx.rotate(Math.PI / 4);
      rr *= 0.42;
    }
    ctx.restore();
  }

  /** small-caps eyebrow above a block */
  title(text: string, y: number, size = 42) {
    const f = this.fit(text, 9, size, this.cinzel("500"));
    this.ctx.textBaseline = "alphabetic";
    this.ink(text, y, f.spacing * this.U, GOLD, "rgba(238,201,138,.45)", 12);
  }

  /** bright light-to-gold gradient type on near-black */
  name(text: string, y: number, size: number, spacing?: number, weight = "600") {
    const f = this.fit(text, spacing ?? size * 0.09, size, this.cinzel(weight));
    this.ink(
      text,
      y,
      f.spacing * this.U,
      this.goldGrad(y * this.U, f.size * this.U),
      "rgba(238,201,138,.28)",
      14
    );
  }

  body(text: string, y: number, size = 44, italic = false, alpha = 0.94) {
    const f = this.fit(text, size * 0.03, size, this.cormorant("400", italic), GRID - 104 * 2 - 58);
    this.ink(text, y, f.spacing * this.U, `rgba(244,238,228,${alpha})`);
  }

  /** a plain Cinzel line — dates, times, the pill label */
  cap(text: string, y: number, size: number, spacing: number, color: string, weight = "400", blur = 0, maxW?: number) {
    const f = this.fit(text, spacing, size, this.cinzel(weight), maxW);
    this.ink(text, y, f.spacing * this.U, color, blur ? "rgba(238,201,138,.34)" : undefined, blur);
  }

  /** the decorative ampersand / connective word, in italic Cormorant */
  script(text: string, y: number, size: number, color: string, blur = 0) {
    this.fit(text, 0, size, this.cormorant("300", true));
    this.ink(text, y, 0, color, blur ? "rgba(238,201,138,.4)" : undefined, blur);
  }

  pill() {
    const ctx = this.ctx;
    const U = this.U;
    const g = ctx.createLinearGradient(0, PILL.y * U, 0, (PILL.y + PILL.h) * U);
    g.addColorStop(0, "#fff6e2");
    g.addColorStop(0.46, "#f4dcac");
    g.addColorStop(0.54, "#eccf98");
    g.addColorStop(1, "#d9ab68");
    const x = PILL.x * U;
    const y = PILL.y * U;
    const w = PILL.w * U;
    const h = PILL.h * U;
    const r = PILL.r * U;
    ctx.save();
    ctx.shadowColor = "rgba(238,201,138,.42)";
    ctx.shadowBlur = 26 * U;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    this.cap(VENUE.cta, PILL.y + PILL.h / 2 + 13, 36, 8, "#1a1105", "600", 0, PILL.w - 96);
  }
}

/** Draw all six panels. Returns canvases indexed by BoxGeometry material slot. */
export function drawFaces(tex: number, fonts: Fonts): Record<number, HTMLCanvasElement> {
  const out: Record<number, HTMLCanvasElement> = {};

  // 1 — Welcome (front)
  {
    const p = new Panel(tex, fonts);
    p.base("wine", 452, 430, 340);
    p.ornament(GRID / 2, 250, 300);
    p.name(COUPLE.him.name.toUpperCase(), 392, 116, 12);
    p.script("&", 470, 62, "rgba(238,201,138,.82)", 10);
    p.name(COUPLE.her.name.toUpperCase(), 570, 116, 12);
    p.rule(GRID / 2, 632, 300, 0.45);
    p.title(EVENT.kind, 700);
    p.body("Swipe to explore", 772, 42, false, 0.66);
    p.cap(EVENT.dateLine, 856, 46, 7, C_GOLD, "400", 12);
    p.edges();
    out[4] = p.canvas;
  }

  // 2 — The Couple (right)
  {
    const p = new Panel(tex, fonts);
    p.base("violet", 512, 420, 350);
    p.title("THE COUPLE", 244);
    p.name(COUPLE.him.name, 384, 92, 5, "500");
    p.body(COUPLE.him.parents, 450, 42, false, 0.9);
    p.rule(322, 534, 210, 0.38);
    p.rule(702, 534, 210, 0.38);
    p.script("&", 556, 66, "rgba(238,201,138,.84)", 10);
    p.name(COUPLE.her.name, 672, 92, 5, "500");
    p.body(COUPLE.her.parents, 738, 42, false, 0.9);
    p.sparkle(GRID / 2, 832, 24, 0.9);
    p.edges();
    out[0] = p.canvas;
  }

  // 3 — The Date (back): an engraved calendar plate, never an HTML calendar
  {
    const p = new Panel(tex, fonts);
    p.base("indigo", 476, 420, 360);
    p.title("SAVE THE DATE", 240);
    p.name(EVENT.day, 512, 236, 6, "400");
    p.rule(236, 442, 172, 0.5);
    p.rule(788, 442, 172, 0.5);
    p.cap(EVENT.month, 606, 64, 16, C_WARM, "500", 12);
    p.cap(EVENT.year, 676, 52, 15, "rgba(238,201,138,.86)");
    p.rule(GRID / 2, 724, 280, 0.45);
    p.cap(EVENT.weekday, 790, 50, 15, C_WARM, "500", 10);
    p.cap(EVENT.time, 858, 42, 3, "rgba(244,238,228,.94)");
    p.edges();
    out[5] = p.canvas;
  }

  // 4 — The Families (top)
  {
    const p = new Panel(tex, fonts);
    p.base("plum", 512, 420, 360);
    p.title("WITH THE BLESSINGS", 236);
    p.title("OF OUR FAMILIES", 296);
    p.rule(GRID / 2, 348, 330, 0.45);
    p.name(COUPLE.him.name, 452, 86, 5, "500");
    p.body(COUPLE.him.parents, 514, 40, false, 0.9);
    p.rule(316, 592, 200, 0.36);
    p.rule(708, 592, 200, 0.36);
    p.script("and", 606, 46, "rgba(238,201,138,.82)");
    p.name(COUPLE.her.name, 706, 86, 5, "500");
    p.body(COUPLE.her.parents, 768, 40, false, 0.9);
    p.rule(GRID / 2, 830, 330, 0.45);
    p.edges();
    out[2] = p.canvas;
  }

  // 5 — The Venue (left)
  {
    const p = new Panel(tex, fonts);
    p.base("indigo", 486, 430, 360);
    p.title("THE VENUE", 236);
    p.name(VENUE.name, 348, 80, 7);
    p.cap(VENUE.qualifier, 412, 38, 13, "rgba(238,201,138,.8)");
    p.rule(GRID / 2, 458, 260, 0.4);
    p.body(VENUE.address[0], 538, 43);
    p.body(VENUE.address[1], 592, 43);
    p.body(VENUE.address[2], 646, 43);
    p.pill();
    p.edges();
    out[1] = p.canvas;
  }

  // 6 — The Message (bottom)
  {
    const p = new Panel(tex, fonts);
    p.base("wine", 470, 430, 350);
    p.title(MESSAGE.heading, 240);
    const sp: [number, number, number][] = [
      [198, 356, 11],
      [842, 396, 9],
      [166, 560, 7],
      [870, 590, 8],
      [236, 852, 9],
      [802, 866, 11],
    ];
    for (const s of sp) p.sparkle(s[0], s[1], s[2], 0.6);
    p.body(MESSAGE.lines[0], 432, 47, true, 0.95);
    p.body(MESSAGE.lines[1], 494, 47, true, 0.95);
    p.rule(GRID / 2, 576, 300, 0.45);
    p.name(MESSAGE.signature, 676, 74, 4, "500");
    p.cap(EVENT.dateLine, 774, 44, 7, C_GOLD, "400", 12);
    p.edges();
    out[3] = p.canvas;
  }

  return out;
}
