/**
 * The galaxy and everything around it. All particles share one ShaderMaterial on
 * BufferGeometry: twinkle in the vertex shader, and a fragment that combines a
 * soft falloff with a tight hot centre so stars have a real core.
 */

import * as THREE from "three";

const VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aScale;
  attribute float aPhase;
  uniform float uTime;
  uniform float uSize;
  uniform float uBoost;
  uniform float uTwinkle;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    float tw = 0.74 + 0.26 * sin(uTime * (0.55 + aPhase * 0.9) + aPhase * 6.2831) * uTwinkle;
    vAlpha = tw * (1.0 + uBoost * 0.85);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * aScale * (300.0 / max(-mv.z, 0.001)) * (0.86 + 0.28 * tw);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv) * 2.0;
    float core = clamp(1.0 - d, 0.0, 1.0);
    float soft = pow(core, 2.6);
    float hot  = pow(core, 8.0);
    float a = (soft * 0.72 + hot * 1.15) * vAlpha * uOpacity;
    if (a < 0.004) discard;
    // The palette is authored in display space, but this renders into the
    // composer's linear buffer, which OutputPass encodes at the end. Convert
    // here or every star reads back two stops too bright; cores above 1.0 stay
    // hot, which is exactly what gives bloom something to catch.
    gl_FragColor = vec4(pow(vColor * (0.82 + hot * 1.5), vec3(2.2)), a);
  }
`;

export function pointMaterial(size: number, dpr: number, opacity: number, twinkle: boolean) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: size * dpr },
      uOpacity: { value: opacity },
      uBoost: { value: 0 },
      uTwinkle: { value: twinkle ? 1 : 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
}

interface Vertex {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  s: number;
}

export function buildPoints(
  count: number,
  fill: (v: Vertex, i: number) => void,
  material: THREE.ShaderMaterial
) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const scl = new Float32Array(count);
  const pha = new Float32Array(count);
  const v: Vertex = { x: 0, y: 0, z: 0, r: 1, g: 1, b: 1, s: 1 };
  for (let i = 0; i < count; i++) {
    fill(v, i);
    pos[i * 3] = v.x;
    pos[i * 3 + 1] = v.y;
    pos[i * 3 + 2] = v.z;
    col[i * 3] = v.r;
    col[i * 3 + 1] = v.g;
    col[i * 3 + 2] = v.b;
    scl[i] = v.s;
    pha[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aScale", new THREE.BufferAttribute(scl, 1));
  g.setAttribute("aPhase", new THREE.BufferAttribute(pha, 1));
  return new THREE.Points(g, material);
}

export function radialTexture(size: number, stops: [number, string][]) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const s of stops) g.addColorStop(s[0], s[1]);
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

const TINTS: [number, number, number][] = [
  [1.0, 0.98, 0.94],
  [1.0, 0.9, 0.74],
  [0.78, 0.84, 1.0],
  [0.94, 0.8, 0.88],
];

/** Stars sit "at infinity": normalising the size attenuation by distance means
 *  apparent size comes from aScale alone — most tiny, a few bright. */
const ATTEN = 300;

export interface Starfield {
  galaxy: THREE.Group;
  stars: THREE.Group;
  material: THREE.ShaderMaterial;
  dust: THREE.Points;
  nearStars: THREE.Points;
  shooters: Shooter[];
  galaxyHome: THREE.Vector3;
  fireShooter(): void;
}

interface Shooter {
  sprite: THREE.Sprite;
  t: number;
  life: number;
  vx: number;
  vy: number;
}

export function createStarfield(dpr: number, reduced: boolean): Starfield {
  const material = pointMaterial(3.2, dpr, 1.0, !reduced);

  // ---- barred spiral: five swept arms, density falling off naturally ----
  const GAL_R = 46;
  const ARMS = 5;
  const galaxy = new THREE.Group();
  const disc = buildPoints(
    11000,
    (v, i) => {
      const r = Math.pow(Math.random(), 0.62) * GAL_R;
      const branch = ((i % ARMS) / ARMS) * Math.PI * 2;
      const swirl = branch + (r / GAL_R) * 3.6;
      const spread = 0.34 + (r / GAL_R) * 0.9;
      const off = () => Math.pow(Math.random(), 2.9) * (Math.random() < 0.5 ? 1 : -1) * spread * 4.2;

      v.x = Math.cos(swirl) * r + off();
      v.z = Math.sin(swirl) * r + off();
      v.y = (off() + Math.pow(Math.random(), 3.2) * (Math.random() < 0.5 ? 1 : -1) * 3.4) * 0.24;

      // warm ivory core → peach → magenta → deep blue at the rim
      const t = r / GAL_R;
      let cr: number, cg: number, cb: number;
      if (t < 0.22) {
        const k = t / 0.22;
        cr = mix(1.0, 0.99, k); cg = mix(0.97, 0.8, k); cb = mix(0.88, 0.62, k);
      } else if (t < 0.48) {
        const k = (t - 0.22) / 0.26;
        cr = mix(0.99, 0.86, k); cg = mix(0.8, 0.38, k); cb = mix(0.62, 0.55, k);
      } else if (t < 0.76) {
        const k = (t - 0.48) / 0.28;
        cr = mix(0.86, 0.42, k); cg = mix(0.38, 0.26, k); cb = mix(0.55, 0.74, k);
      } else {
        const k = (t - 0.76) / 0.24;
        cr = mix(0.42, 0.16, k); cg = mix(0.26, 0.19, k); cb = mix(0.74, 0.58, k);
      }
      const bright = 1.06 - t * 0.72;
      v.r = cr * bright;
      v.g = cg * bright;
      v.b = cb * bright;
      v.s = (0.1 + Math.pow(Math.random(), 2.4) * 0.3) * (1 + (1 - t) * 1.8) * 0.4;
    },
    material
  );
  galaxy.add(disc);

  const core = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialTexture(256, [
        [0, "rgba(255,248,232,.95)"],
        [0.16, "rgba(255,224,180,.62)"],
        [0.42, "rgba(214,128,138,.20)"],
        [1, "rgba(120,60,120,0)"],
      ]),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 0.95,
    })
  );
  core.scale.set(30, 30, 1);
  galaxy.add(core);

  // near edge-on, pushed to the upper left and far back so the cube sits against clear sky
  galaxy.rotation.set(-1.16, 0.34, 0.42);
  const galaxyHome = new THREE.Vector3(-17, 14, -94);
  galaxy.position.copy(galaxyHome);

  // ---- stars, dust, veils ----
  const stars = new THREE.Group();

  const shell = (rMin: number, rMax: number, sMin: number, sRange: number, bright: number) =>
    (v: Vertex) => {
      const r = rMin + Math.random() * (rMax - rMin);
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      v.x = r * Math.sin(ph) * Math.cos(th);
      v.y = r * Math.sin(ph) * Math.sin(th) * 0.85;
      v.z = r * Math.cos(ph);
      if (v.z > -8) v.z = -8 - Math.random() * (rMax - 8);
      const t = TINTS[(Math.random() * TINTS.length) | 0];
      const b = bright * (0.55 + Math.random() * 0.55);
      v.r = t[0] * b;
      v.g = t[1] * b;
      v.b = t[2] * b;
      const dist = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
      v.s = (sMin + Math.pow(Math.random(), 3.2) * sRange) * (dist / ATTEN);
    };

  const farStars = buildPoints(2200, shell(170, 330, 0.14, 1.3, 0.72), material);
  const midStars = buildPoints(900, shell(90, 170, 0.16, 1.45, 0.9), material);
  const nearStars = buildPoints(240, shell(40, 90, 0.2, 1.6, 1.0), material);
  stars.add(farStars, midStars, nearStars);

  const dust = buildPoints(
    420,
    (v) => {
      const r = 26 + Math.random() * 120;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      v.x = r * Math.sin(ph) * Math.cos(th);
      v.y = r * Math.sin(ph) * Math.sin(th) * 0.7;
      v.z = -10 - Math.random() * r;
      const w = 0.055 + Math.random() * 0.055;
      v.r = w;
      v.g = w * 0.82;
      v.b = w * 0.92;
      const dd = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
      v.s = (1.5 + Math.random() * 1.6) * (dd / ATTEN);
    },
    material
  );
  stars.add(dust);

  const veilTex = radialTexture(256, [
    [0, "rgba(255,255,255,.85)"],
    [0.42, "rgba(255,255,255,.30)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  const veil = (color: number, x: number, y: number, z: number, s: number, o: number) => {
    const m = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: veilTex,
        color: new THREE.Color(color),
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        opacity: o,
      })
    );
    m.position.set(x, y, z);
    m.scale.set(s, s * 0.72, 1);
    stars.add(m);
  };
  veil(0x2b2f7a, -46, 26, -150, 190, 0.1);
  veil(0x6d1f63, 54, -20, -170, 220, 0.075);
  veil(0x1d2456, 10, 44, -120, 150, 0.06);

  // ---- shooting stars: a pool of three tapered streaks ----
  const streak = (() => {
    const w = 256;
    const h = 32;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const x = c.getContext("2d")!;
    for (let i = 0; i < w; i++) {
      const t = i / (w - 1);
      const a = Math.pow(t, 3.0);
      const thick = Math.max(0.6, h * 0.5 * Math.pow(t, 1.6));
      const g = x.createLinearGradient(0, h / 2 - thick, 0, h / 2 + thick);
      g.addColorStop(0, "rgba(255,240,214,0)");
      g.addColorStop(0.5, `rgba(255,246,228,${a})`);
      g.addColorStop(1, "rgba(255,240,214,0)");
      x.fillStyle = g;
      x.fillRect(i, h / 2 - thick, 1.2, thick * 2);
    }
    const t2 = new THREE.CanvasTexture(c);
    t2.colorSpace = THREE.SRGBColorSpace;
    return t2;
  })();

  const shooters: Shooter[] = [];
  for (let i = 0; i < 3; i++) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: streak,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      })
    );
    sprite.scale.set(22, 1.6, 1);
    sprite.visible = false;
    stars.add(sprite);
    shooters.push({ sprite, t: 0, life: 0, vx: 0, vy: 0 });
  }

  function fireShooter() {
    for (const s of shooters) {
      if (s.life > 0) continue;
      const ang = -0.9 + Math.random() * 0.5 + (Math.random() < 0.5 ? 0 : Math.PI);
      const d = 60 + Math.random() * 40;
      s.sprite.position.set((Math.random() - 0.5) * 130, 12 + Math.random() * 46, -d);
      s.sprite.material.rotation = ang;
      s.sprite.scale.set(16 + Math.random() * 16, 1.1 + Math.random() * 0.9, 1);
      s.vx = Math.cos(ang) * (26 + Math.random() * 20);
      s.vy = Math.sin(ang) * (26 + Math.random() * 20);
      s.life = 1.0 + Math.random() * 0.6;
      s.t = 0;
      s.sprite.visible = true;
      return;
    }
  }

  return { galaxy, stars, material, dust, nearStars, shooters, galaxyHome, fireShooter };
}
