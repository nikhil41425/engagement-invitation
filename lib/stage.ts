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
  /** the spill down the floor toward the viewer; breathes with the drag */
  smear: THREE.Mesh;
  lights: THREE.Object3D[];
}

/**
 * A soft studio backdrop, drawn once into a texture and hung far behind.
 *
 * The plane is 150 units across at z = -34, but the camera only ever sees a
 * window of roughly 15 x 33 units of it — so a gradient authored across the
 * whole canvas puts every one of its stops outside the shot and reads as flat
 * colour. Each pool below is sized against that visible window instead: `VIS`
 * is its half-height in canvas units, so a radius of 1 x VIS fades out exactly
 * at the top and bottom of the frame.
 *
 * The warm pool sits directly behind the object, and it is what separates the
 * silhouette from the dark now that the object carries no halo of its own.
 */
function backdrop(): THREE.Mesh {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const x = c.getContext("2d")!;

  /* the object's centre, mapped onto the plane: world y = 77 - v * 150 */
  const CX = size * 0.5;
  const CY = size * 0.515;
  const VIS = size * 0.11;

  x.fillStyle = "#05030a";
  x.fillRect(0, 0, size, size);

  /* a broad violet lift, kept dim — this is atmosphere, not a light source */
  const violet = x.createRadialGradient(CX, CY - VIS * 0.4, 10, CX, CY - VIS * 0.4, VIS * 2.6);
  violet.addColorStop(0, "rgba(70,36,104,.14)");
  violet.addColorStop(0.5, "rgba(54,28,86,.07)");
  violet.addColorStop(1, "rgba(86,44,126,0)");
  x.fillStyle = violet;
  x.fillRect(0, 0, size, size);

  /* The warm pool behind the object — the halo's job, done from the backdrop.
     Tight on purpose: it has to fall away inside the frame, or it stops being
     a pool of light behind the object and becomes a wash over everything. */
  const warm = x.createRadialGradient(CX, CY, 4, CX, CY, VIS * 0.72);
  warm.addColorStop(0, "rgba(140,46,72,.44)");
  warm.addColorStop(0.34, "rgba(96,32,56,.26)");
  warm.addColorStop(0.68, "rgba(46,16,36,.10)");
  warm.addColorStop(1, "rgba(5,3,10,0)");
  x.fillStyle = warm;
  x.fillRect(0, 0, size, size);

  /* a vignette scaled to the frame, so the corners actually go black */
  const vig = x.createRadialGradient(CX, CY, VIS * 0.3, CX, CY, VIS * 1.25);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(0.5, "rgba(4,2,9,.5)");
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
    [0, "rgba(108,84,122,.58)"],
    [0.3, "rgba(58,38,68,.36)"],
    [0.62, "rgba(22,13,30,.17)"],
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
        [0, "rgba(255,210,156,.60)"],
        [0.26, "rgba(220,138,90,.29)"],
        [0.6, "rgba(130,55,96,.10)"],
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
     hides a true mirrored copy, so this stands in for it. It breathes with the
     drag now: with the object's own glow gone, this is what says the light in
     the scene is coming off the object rather than painted on the floor. */
  const smear = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 5.2),
    new THREE.MeshBasicMaterial({
      map: radialTexture(256, [
        [0, "rgba(255,200,140,.50)"],
        [0.34, "rgba(212,122,84,.21)"],
        [0.7, "rgba(102,42,74,.06)"],
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
  //
  // Pushed up from where it sat while the object lit itself. The key is what
  // rakes the gold armature now, and the kicker is the only thing drawing a
  // cool edge down the far side of the object.
  const key = new THREE.DirectionalLight(0xffe3bd, 1.18);
  key.position.set(2.2, 6.2, 4.4);
  const kick = new THREE.DirectionalLight(0x9a7dff, 0.58);
  kick.position.set(-4.6, 2.2, -4.2);
  const bounce = new THREE.PointLight(0xff9a6a, 4.8, 16, 2);
  bounce.position.set(0, FLOOR_Y + 0.1, 1.4);
  const amb = new THREE.AmbientLight(0x59456e, 0.52);

  return { group, bokeh, bokehMaterial, bokehHome, glowPool, smear, lights: [key, kick, bounce, amb] };
}
