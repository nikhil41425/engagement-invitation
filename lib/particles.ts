/**
 * Shared particle machinery: one ShaderMaterial on BufferGeometry, twinkle in
 * the vertex shader, and a fragment combining a soft falloff with a tight hot
 * centre so each mote has a real core instead of looking like a fuzzy blob.
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
