/**
 * The stage: a lit plinth on a polished floor, a deep maroon-violet studio
 * backdrop, and warm gold bokeh drifting through the light.
 *
 * There is no true planar reflector: it would cost a second render of the whole
 * scene every frame, and the plinth hides most of what it would show. The light
 * the object spills down the floor is drawn directly instead.
 */

import * as THREE from "three";
import { buildPoints, pointMaterial, radialTexture } from "./particles";

export const FLOOR_Y = -1.72;
/** the surface the object stands on */
export const PLINTH_TOP = FLOOR_Y + 0.39;

export interface Stage {
  group: THREE.Group;
  bokeh: THREE.Points;
  bokehMaterial: THREE.ShaderMaterial;
  bokehHome: Float32Array;
  glowPool: THREE.Mesh;
  lights: THREE.Object3D[];
}

/** A soft studio backdrop, drawn once into a texture and hung far behind. */
function backdrop(): THREE.Mesh {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const x = c.getContext("2d")!;

  x.fillStyle = "#05030a";
  x.fillRect(0, 0, size, size);

  const warm = x.createRadialGradient(size * 0.5, size * 0.56, 10, size * 0.5, size * 0.56, size * 0.34);
  warm.addColorStop(0, "rgba(96,28,48,.42)");
  warm.addColorStop(0.42, "rgba(52,18,38,.20)");
  warm.addColorStop(0.75, "rgba(22,10,26,.07)");
  warm.addColorStop(1, "rgba(5,3,10,0)");
  x.fillStyle = warm;
  x.fillRect(0, 0, size, size);

  const violet = x.createRadialGradient(size * 0.28, size * 0.34, 10, size * 0.28, size * 0.34, size * 0.3);
  violet.addColorStop(0, "rgba(74,38,110,.20)");
  violet.addColorStop(1, "rgba(86,44,126,0)");
  x.fillStyle = violet;
  x.fillRect(0, 0, size, size);

  const vig = x.createRadialGradient(size / 2, size * 0.54, size * 0.12, size / 2, size * 0.54, size * 0.5);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(0.55, "rgba(4,2,9,.55)");
  vig.addColorStop(1, "rgba(3,1,7,1)");
  x.fillStyle = vig;
  x.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 150),
    new THREE.MeshBasicMaterial({ map: tex, depthWrite: false, fog: false })
  );
  mesh.position.set(0, 2, -34);
  return mesh;
}

export function createStage(dpr: number, reduced: boolean, envMap: THREE.Texture): Stage {
  const group = new THREE.Group();
  group.add(backdrop());

  // ---- floor ----
  const floorTex = radialTexture(256, [
    [0, "rgba(96,74,110,.55)"],
    [0.3, "rgba(52,34,62,.34)"],
    [0.62, "rgba(20,12,28,.16)"],
    [1, "rgba(6,3,10,0)"],
  ]);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(64, 64),
    new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, depthWrite: false })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  group.add(floor);

  /* the warm pool the plinth stands in */
  const glowPool = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 11),
    new THREE.MeshBasicMaterial({
      map: radialTexture(256, [
        [0, "rgba(255,206,148,.5)"],
        [0.26, "rgba(214,132,86,.24)"],
        [0.6, "rgba(120,50,90,.08)"],
        [1, "rgba(40,20,60,0)"],
      ]),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  glowPool.rotation.x = -Math.PI / 2;
  glowPool.position.y = FLOOR_Y + 0.012;
  group.add(glowPool);

  // ---- plinth ----
  const plinth = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x1a1426,
    metalness: 0.82,
    roughness: 0.3,
    envMap,
    envMapIntensity: 1.3,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xe8bf85,
    metalness: 1.0,
    roughness: 0.2,
    envMap,
    envMapIntensity: 2.1,
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.34, 1.44, 0.32, 64), bodyMat);
  body.position.y = FLOOR_Y + 0.17;
  plinth.add(body);

  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.36, 1.36, 0.05, 64), rimMat);
  top.position.y = FLOOR_Y + 0.36;
  plinth.add(top);
  group.add(plinth);

  /* the object's light spilling down the floor toward the viewer — the plinth
     hides a true mirrored copy, so this stands in for it */
  const smear = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 4.6),
    new THREE.MeshBasicMaterial({
      map: radialTexture(256, [
        [0, "rgba(255,196,132,.42)"],
        [0.34, "rgba(206,116,80,.18)"],
        [0.7, "rgba(96,40,70,.05)"],
        [1, "rgba(30,14,40,0)"],
      ]),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  smear.rotation.x = -Math.PI / 2;
  smear.position.set(0, FLOOR_Y + 0.02, 2.4);
  group.add(smear);

  // ---- bokeh: warm motes drifting through the light ----
  const bokehMaterial = pointMaterial(3.0, dpr, 1.0, !reduced);
  const bokeh = buildPoints(
    260,
    (v) => {
      v.x = (Math.random() - 0.5) * 22;
      v.y = FLOOR_Y + Math.random() * 13;
      v.z = -16 + Math.random() * 20;
      const w = 0.62 + Math.random() * 0.38;
      v.r = w;
      v.g = w * 0.6 + 0.05;
      v.b = w * 0.26;
      v.s = 0.028 + Math.pow(Math.random(), 1.6) * 0.085;
    },
    bokehMaterial
  );
  group.add(bokeh);
  const bokehHome = (bokeh.geometry.getAttribute("position").array as Float32Array).slice(0);

  // ---- lighting: a warm key from above-front, a cool kicker behind ----
  const key = new THREE.DirectionalLight(0xffe3bd, 1.05);
  key.position.set(2.2, 6.2, 4.4);
  const kick = new THREE.DirectionalLight(0x9a7dff, 0.5);
  kick.position.set(-4.6, 2.2, -4.2);
  const bounce = new THREE.PointLight(0xff9a6a, 4.0, 16, 2);
  bounce.position.set(0, FLOOR_Y + 0.1, 1.4);
  const amb = new THREE.AmbientLight(0x59456e, 0.5);

  return { group, bokeh, bokehMaterial, bokehHome, glowPool, lights: [key, kick, bounce, amb] };
}
