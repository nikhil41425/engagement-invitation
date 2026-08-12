/**
 * The object itself: lacquered panels, a hairline gold armature, its bevel glow
 * and halo, the shell of gold motes, and the lamps that model the metal.
 */

import * as THREE from "three";
import { buildPoints, pointMaterial, radialTexture } from "./particles";

/**
 * A small studio, rendered to six canvases and pre-filtered with PMREM so the
 * gold gets roughness-aware image-based lighting instead of a flat mirror.
 * Warm ceiling, violet walls, two soft-box strips and a cool kicker: metal only
 * looks like metal when it has something specific to reflect.
 */
export function createStudioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const faces: HTMLCanvasElement[] = [];
  for (let i = 0; i < 6; i++) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const x = c.getContext("2d")!;
    const g = x.createLinearGradient(0, 0, 0, 256);
    if (i === 2) {
      g.addColorStop(0, "#8a6a35");
      g.addColorStop(0.55, "#4c3a48");
      g.addColorStop(1, "#241a38");
    } else if (i === 3) {
      g.addColorStop(0, "#1d1028");
      g.addColorStop(1, "#080512");
    } else {
      g.addColorStop(0, "#6a5330");
      g.addColorStop(0.3, "#3b2c50");
      g.addColorStop(0.7, "#221838");
      g.addColorStop(1, "#0d0918");
    }
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);

    if (i !== 3) {
      const strips: [number, number, number][] =
        i === 2 ? [[20, 52, 0.95]] : [[44, 26, 0.72], [132, 14, 0.34]];
      for (const [sy, sh, sa] of strips) {
        const sg = x.createLinearGradient(0, sy - sh, 0, sy + sh);
        sg.addColorStop(0, "rgba(255,238,208,0)");
        sg.addColorStop(0.5, `rgba(255,242,216,${sa})`);
        sg.addColorStop(1, "rgba(255,238,208,0)");
        x.fillStyle = sg;
        x.fillRect(0, sy - sh, 256, sh * 2);
      }
      const kg = x.createRadialGradient(36, 192, 4, 36, 192, 124);
      kg.addColorStop(0, "rgba(150,178,255,.34)");
      kg.addColorStop(1, "rgba(150,178,255,0)");
      x.fillStyle = kg;
      x.fillRect(0, 0, 256, 256);
    }
    faces.push(c);
  }

  const cube = new THREE.CubeTexture(faces);
  cube.colorSpace = THREE.SRGBColorSpace;
  cube.needsUpdate = true;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileCubemapShader();
  const target = pmrem.fromCubemap(cube);
  pmrem.dispose();
  cube.dispose();
  return target.texture;
}

export interface CubeRig {
  /** float, wobble and the tap-to-read push toward the viewer */
  group: THREE.Group;
  /** drag orientation only */
  rotor: THREE.Group;
  mesh: THREE.Mesh;
  panels: THREE.MeshPhysicalMaterial[];
  glowBox: THREE.Mesh;
  halo: THREE.Sprite;
  motes: THREE.Points;
  moteMaterial: THREE.ShaderMaterial;
  moteHome: Float32Array;
  goldPoint: THREE.PointLight;
  lights: THREE.Object3D[];
}

export function createCube(envMap: THREE.Texture, dpr: number): CubeRig {
  const group = new THREE.Group();
  const rotor = new THREE.Group();
  group.add(rotor);

  const panels: THREE.MeshPhysicalMaterial[] = [];
  for (let i = 0; i < 6; i++) {
    panels.push(
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.3,
        metalness: 0.1,
        // Lacquer: a visible rake of light across the coat, but dialled back from
        // 0.9 — that lobe was washing the ink-black panels grey under the type.
        clearcoat: 0.45,
        clearcoatRoughness: 0.1,
        emissive: 0xffffff,
        emissiveIntensity: 0.3,
        envMap,
        envMapIntensity: 0.05,
      })
    );
  }

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.98, 1.98, 1.98), panels);
  rotor.add(mesh);

  // hairline armature: 12 rails + 8 corner spheres of matching radius, sitting a
  // hair proud of the panel so the frame reads as a real edge
  const RAIL_R = 0.027;
  const HALF = 1.0;
  const gold = new THREE.MeshStandardMaterial({
    color: 0xffdca4,
    metalness: 1.0,
    roughness: 0.16,
    emissive: 0x3a2707,
    emissiveIntensity: 0.34,
    envMap,
    envMapIntensity: 2.3,
  });
  const railGeo = new THREE.CylinderGeometry(RAIL_R, RAIL_R, HALF * 2, 18, 1, false);
  const cornerGeo = new THREE.SphereGeometry(RAIL_R, 20, 14);
  const s = [-1, 1];
  for (let axis = 0; axis < 3; axis++) {
    for (let a = 0; a < 2; a++) {
      for (let b = 0; b < 2; b++) {
        const rail = new THREE.Mesh(railGeo, gold);
        if (axis === 0) {
          rail.rotation.z = Math.PI / 2;
          rail.position.set(0, s[a] * HALF, s[b] * HALF);
        } else if (axis === 1) {
          rail.position.set(s[a] * HALF, 0, s[b] * HALF);
        } else {
          rail.rotation.x = Math.PI / 2;
          rail.position.set(s[a] * HALF, s[b] * HALF, 0);
        }
        rotor.add(rail);
      }
    }
  }
  for (let a = 0; a < 2; a++)
    for (let b = 0; b < 2; b++)
      for (let c = 0; c < 2; c++) {
        const corner = new THREE.Mesh(cornerGeo, gold);
        corner.position.set(s[a] * HALF, s[b] * HALF, s[c] * HALF);
        rotor.add(corner);
      }

  const glowBox = new THREE.Mesh(
    new THREE.BoxGeometry(2.12, 2.12, 2.12),
    new THREE.MeshBasicMaterial({
      color: 0xd9b6ff,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.075,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  rotor.add(glowBox);

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialTexture(256, [
        [0, "rgba(255,226,178,.55)"],
        [0.34, "rgba(210,140,90,.22)"],
        [0.7, "rgba(120,60,110,.08)"],
        [1, "rgba(60,30,80,0)"],
      ]),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 0.62,
    })
  );
  halo.scale.set(8.4, 8.4, 1);
  halo.position.z = -1.7;
  group.add(halo);

  const moteMaterial = pointMaterial(3.0, dpr, 1.0, true);
  const motes = buildPoints(
    170,
    (v) => {
      const r = 1.7 + Math.random() * 1.9;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      v.x = r * Math.sin(ph) * Math.cos(th);
      v.y = r * Math.sin(ph) * Math.sin(th);
      v.z = r * Math.cos(ph);
      const w = 0.5 + Math.random() * 0.5;
      v.r = w;
      v.g = w * 0.78;
      v.b = w * 0.42;
      // normalised against the cube's viewing distance so motes stay gold specks
      v.s = (0.3 + Math.pow(Math.random(), 2.0) * 0.85) * ((5.6 - v.z) / 300);
    },
    moteMaterial
  );
  group.add(motes);
  const moteHome = (motes.geometry.getAttribute("position").array as Float32Array).slice(0);

  // The panels carry their own light through the emissive map, so the lamps are
  // kept low: they exist to model the gold armature, not to wash the ink panels.
  const key = new THREE.DirectionalLight(0xffe6c2, 0.85);
  key.position.set(3.4, 4.2, 4.0);
  const rim = new THREE.DirectionalLight(0x7fa0ff, 0.62);
  rim.position.set(-4.2, 1.4, -3.6);
  const goldPoint = new THREE.PointLight(0xffcd82, 7.0, 20, 2);
  goldPoint.position.set(2.4, 2.8, 4.2);
  const fill = new THREE.PointLight(0xd06bb0, 5.0, 16, 2);
  fill.position.set(-1.2, -3.2, 1.4);
  const amb = new THREE.AmbientLight(0x6a648c, 0.42);

  return {
    group,
    rotor,
    mesh,
    panels,
    glowBox,
    halo,
    motes,
    moteMaterial,
    moteHome,
    goldPoint,
    lights: [key, rim, goldPoint, fill, amb],
  };
}

/** The 24 axis-aligned orientations, from every valid pair of signed axis basis vectors. */
export function axisAlignedOrientations(): THREE.Quaternion[] {
  const A = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
  ];
  const out: THREE.Quaternion[] = [];
  for (const x of A)
    for (const y of A) {
      if (Math.abs(x.dot(y)) > 0.5) continue;
      const z = new THREE.Vector3().crossVectors(x, y);
      const m = new THREE.Matrix4().makeBasis(x, y, z);
      out.push(new THREE.Quaternion().setFromRotationMatrix(m));
    }
  return out;
}

export const LOCAL_NORMALS = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];
