/**
 * The invitation scene: renderer, camera fit, drag physics, the settle onto one
 * of 24 axis-aligned orientations, the reveal, and the post pipeline.
 *
 * Kept imperative on purpose — the gesture model is a quaternion integrator with
 * its own damping and snap, which is clearer as plain code than as a component
 * tree, and it keeps React out of the per-frame path entirely.
 */

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

import { FACE_ORDER, MESSAGE_FACE_INDEX, VENUE_SLOT } from "./content";
import { LOCAL_NORMALS, axisAlignedOrientations, createCube, createStudioEnvironment } from "./cube";
import { PILL_UV, drawFaces, type Fonts } from "./faces";
import { createStarfield } from "./starfield";
import { Ambience } from "./sound";

export interface SceneHandle {
  dispose(): void;
  toggleSound(): boolean;
  clearFocus(): void;
  readonly sound: Ambience;
}

export interface SceneCallbacks {
  onFaceChange(index: number): void;
  onFocusChange(focused: boolean): void;
  onFirstInteraction(): void;
}

const SLOT_TO_FACE: number[] = [];
FACE_ORDER.forEach((f, i) => (SLOT_TO_FACE[f.slot] = i));

const CUBE_DIAMETER = 2.92;
const RAD_PER_PX = 0.0082;
const MAX_V = 5.5;
const WORLD_Y = new THREE.Vector3(0, 1, 0);
const WORLD_X = new THREE.Vector3(1, 0, 0);

export function createScene(
  canvas: HTMLCanvasElement,
  fonts: Fonts,
  cb: SceneCallbacks
): SceneHandle {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  // The clear colour is written into the composer's linear buffer verbatim, and
  // OutputPass then encodes it — so hand it the linear form and let the encode
  // land it back on #04030a. Without this the whole sky floor lifts to a violet
  // grey. The direct path (after a performance step-down) wants the plain value.
  const CLEAR = new THREE.Color(0x04030a);
  const CLEAR_LINEAR = CLEAR.clone().convertSRGBToLinear();
  renderer.setClearColor(CLEAR_LINEAR, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 600);
  camera.position.set(0, 0, 6);

  // ---- world ----
  const sky = createStarfield(dpr, reduced);
  scene.add(sky.galaxy, sky.stars);

  const envMap = createStudioEnvironment(renderer);
  const rig = createCube(envMap, dpr);
  scene.add(rig.group, ...rig.lights);

  // Panels are authored on a 1024 grid; render them at more texels on retina
  // screens so a settled face is supersampled rather than mip-blurred.
  const texSize = dpr >= 2 ? 1536 : 1024;
  const faceCanvases = drawFaces(texSize, fonts);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  for (const slot of Object.keys(faceCanvases).map(Number)) {
    const t = new THREE.CanvasTexture(faceCanvases[slot]);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    rig.panels[slot].map = t;
    rig.panels[slot].emissiveMap = t;
    rig.panels[slot].needsUpdate = true;
  }

  // ---- post: one restrained pass, all of it in service of the metal ----
  // three's own composer is used rather than a third-party one because OutputPass
  // performs the colour-space conversion exactly once, at the end. Encoding twice
  // lifts every near-black value and turns the night sky violet.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.5, 0.86);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  let usePost = true;

  // ---- camera fit: the rotational diameter must never clip mid-rotation ----
  let camDist = 6;
  function layout() {
    const w = canvas.clientWidth || 360;
    const h = canvas.clientHeight || 720;
    renderer.setSize(w, h, false);
    // the composer sizes its targets in device pixels, so it needs the ratio too
    // — without this the whole scene renders at CSS resolution and is upscaled
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    const vhalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const distH = CUBE_DIAMETER / 0.72 / 2 / vhalf;
    const distW = CUBE_DIAMETER / 0.94 / 2 / (vhalf * camera.aspect);
    camDist = Math.max(distH, distW);
    camera.updateProjectionMatrix();
  }
  layout();
  window.addEventListener("resize", layout);

  // ---- interaction state ----
  const ORIENTS = axisAlignedOrientations();
  const qTmp = new THREE.Quaternion();
  const worldQ = new THREE.Quaternion();
  const nTmp = new THREE.Vector3();

  let dragging = false;
  let pointerId: number | null = null;
  let lastX = 0;
  let lastY = 0;
  let moved = 0;
  let downT = 0;
  let lastMoveT = 0;
  let velY = 0;
  let velX = 0;
  let opening = true;
  let openT = 0;
  let settled = false;
  let focus = 0;
  let focusTarget = 0;
  let parallaxX = 0;
  let parallaxY = 0;
  let boost = 0;
  let currentFace = 0;

  const emissive = new Array(6).fill(0.3);
  const emissiveTarget = new Array(6).fill(0.3);
  emissiveTarget[FACE_ORDER[0].slot] = 0.62;

  const sound = new Ambience();

  function nearestOrientation(q: THREE.Quaternion) {
    let best = ORIENTS[0];
    let bestDot = -1;
    for (const o of ORIENTS) {
      const d = Math.abs(q.dot(o));
      if (d > bestDot) {
        bestDot = d;
        best = o;
      }
    }
    return best;
  }

  function activeSlot() {
    worldQ.copy(rig.group.quaternion).multiply(rig.rotor.quaternion);
    let best = 4;
    let bestZ = -2;
    for (let i = 0; i < 6; i++) {
      nTmp.copy(LOCAL_NORMALS[i]).applyQuaternion(worldQ);
      if (nTmp.z > bestZ) {
        bestZ = nTmp.z;
        best = i;
      }
    }
    return best;
  }

  function setActiveFace(index: number) {
    if (index === currentFace) return;
    currentFace = index;
    for (let i = 0; i < 6; i++) emissiveTarget[i] = 0.3;
    emissiveTarget[FACE_ORDER[index].slot] = 0.62;
    boost = 1;
    sound.chime();
    cb.onFaceChange(index);
  }

  // ---- pointer ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function hitPill(e: PointerEvent) {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(rig.mesh, false);
    if (!hits.length) return false;
    const h = hits[0];
    if (h.face?.materialIndex !== VENUE_SLOT || !h.uv) return false;
    return h.uv.x >= PILL_UV.u0 && h.uv.x <= PILL_UV.u1 && h.uv.y >= PILL_UV.v0 && h.uv.y <= PILL_UV.v1;
  }

  function onDown(e: PointerEvent) {
    if (pointerId !== null) return;
    pointerId = e.pointerId;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    dragging = true;
    opening = false;
    lastX = e.clientX;
    lastY = e.clientY;
    downT = performance.now();
    lastMoveT = downT;
    moved = 0;
    velY = velX = 0;
    cb.onFirstInteraction();
  }

  function onMove(e: PointerEvent) {
    if (!dragging || e.pointerId !== pointerId) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);

    if (moved > 12 && focusTarget > 0) {
      focusTarget = 0;
      cb.onFocusChange(false);
    }

    // rotate in world space so the gesture always matches the finger, whatever
    // the current orientation — driving Euler angles rolls the cube sideways
    qTmp.setFromAxisAngle(WORLD_Y, dx * RAD_PER_PX);
    rig.rotor.quaternion.premultiply(qTmp);
    qTmp.setFromAxisAngle(WORLD_X, dy * RAD_PER_PX);
    rig.rotor.quaternion.premultiply(qTmp);
    rig.rotor.quaternion.normalize();

    const now = performance.now();
    const dt = Math.max(1 / 240, (now - lastMoveT) / 1000);
    lastMoveT = now;
    velY = THREE.MathUtils.clamp((dx * RAD_PER_PX) / dt, -MAX_V, MAX_V);
    velX = THREE.MathUtils.clamp((dy * RAD_PER_PX) / dt, -MAX_V, MAX_V);

    parallaxX += dx * 0.0016;
    parallaxY += dy * 0.0016;
    settled = false;

    if (Math.abs(dx) + Math.abs(dy) > 6) sound.sweep();
  }

  function onUp(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    pointerId = null;
    dragging = false;

    if (moved < 14 && performance.now() - downT < 420) {
      if (hitPill(e)) {
        velY = velX = 0;
        window.open(
          // the one link in the piece, used exactly as given
          "https://share.google/u1rHnw8wfH0q3O7x1",
          "_blank",
          "noopener"
        );
        return;
      }
      if (settled) {
        focusTarget = focusTarget > 0 ? 0 : 1;
        cb.onFocusChange(focusTarget > 0);
      }
    }
  }

  function onCancel(e: PointerEvent) {
    if (e.pointerId === pointerId) {
      pointerId = null;
      dragging = false;
    }
  }

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onCancel);

  // ---- performance stepping ----
  let perfLevel = 0;
  let frames = 0;
  let perfT0 = performance.now();
  function stepDown() {
    perfLevel++;
    if (perfLevel === 1) {
      // The post pipeline is the first thing to go, then the dust. Bypass the
      // composer wholesale rather than disabling its last pass — with no pass
      // writing to the drawing buffer, nothing reaches the canvas at all.
      usePost = false;
      renderer.setClearColor(CLEAR, 1);
      dpr = Math.min(dpr, 1.35);
      renderer.setPixelRatio(dpr);
      sky.material.uniforms.uSize.value = 3.2 * dpr;
      rig.moteMaterial.uniforms.uSize.value = 3.0 * dpr;
      sky.dust.visible = false;
      layout();
    } else if (perfLevel === 2) {
      dpr = Math.min(dpr, 1.0);
      renderer.setPixelRatio(dpr);
      sky.material.uniforms.uSize.value = 3.2 * dpr;
      sky.nearStars.visible = false;
      rig.motes.visible = false;
      layout();
    }
  }

  // ---- loop ----
  const clock = new THREE.Clock();
  const qOpen = new THREE.Quaternion();
  const eOpen = new THREE.Euler();
  let time = 0;
  let nextShoot = 3 + Math.random() * 5;
  let raf = 0;
  let running = true;

  function tick() {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;

    if (opening) {
      // before the first touch the cube turns gently on its own: this shows the
      // object's depth and makes the swipe affordance obvious without a caption
      openT += dt;
      let ease = Math.min(1, openT / 1.6);
      ease = 1 - Math.pow(1 - ease, 3);
      if (reduced) eOpen.set(-0.1, 0.3, 0);
      else eOpen.set(-0.13 * ease, Math.sin(time * 0.62) * 0.349 * ease, 0);
      qOpen.setFromEuler(eOpen);
      rig.rotor.quaternion.copy(qOpen);
      settled = false;
    } else if (!dragging) {
      if (Math.abs(velY) > 0.0005 || Math.abs(velX) > 0.0005) {
        qTmp.setFromAxisAngle(WORLD_Y, velY * dt);
        rig.rotor.quaternion.premultiply(qTmp);
        qTmp.setFromAxisAngle(WORLD_X, velX * dt);
        rig.rotor.quaternion.premultiply(qTmp);
        rig.rotor.quaternion.normalize();
        const damp = Math.pow(0.955, dt * 60);
        velY *= damp;
        velX *= damp;
      }
      if (Math.abs(velY) < 0.35 && Math.abs(velX) < 0.35) {
        const target = nearestOrientation(rig.rotor.quaternion);
        rig.rotor.quaternion.slerp(target, 1 - Math.exp(-(reduced ? 14 : 8.5) * dt));
        velY *= 0.7;
        velX *= 0.7;
        settled = Math.abs(rig.rotor.quaternion.dot(target)) > 0.9995;
      }
    }

    setActiveFace(SLOT_TO_FACE[activeSlot()]);

    const fl = reduced ? 0 : 1;
    rig.group.position.y = Math.sin(time * 0.5) * 0.075 * fl;
    rig.group.rotation.z = Math.sin(time * 0.33) * 0.022 * fl;
    rig.group.rotation.x = Math.sin(time * 0.27 + 1.1) * 0.018 * fl;

    focus += (focusTarget - focus) * (1 - Math.exp(-6 * dt));
    rig.group.position.z = focus * camDist * 0.13;

    boost += (0 - boost) * (1 - Math.exp(-2.2 * dt));
    const breathe = 0.5 + 0.5 * Math.sin(time * 0.7);
    (rig.glowBox.material as THREE.MeshBasicMaterial).opacity =
      0.055 + breathe * 0.03 + boost * 0.07;
    rig.halo.material.opacity = 0.5 + breathe * 0.12 + boost * 0.26;
    rig.halo.scale.setScalar(8.2 + breathe * 0.35 + boost * 0.9);
    rig.goldPoint.intensity = 5.0 + breathe * 2.0 + boost * 4.2;
    sky.material.uniforms.uBoost.value = boost * 0.85;
    rig.moteMaterial.uniforms.uBoost.value = boost;

    for (let i = 0; i < 6; i++) {
      emissive[i] += (emissiveTarget[i] - emissive[i]) * (1 - Math.exp(-3.4 * dt));
      rig.panels[i].emissiveIntensity = emissive[i];
    }

    if (rig.motes.visible) {
      const pa = rig.motes.geometry.getAttribute("position") as THREE.BufferAttribute;
      const arr = pa.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        const ph = i * 0.37;
        arr[i] = rig.moteHome[i] + Math.sin(time * 0.32 + ph) * 0.1 * fl;
        arr[i + 1] = rig.moteHome[i + 1] + Math.sin(time * 0.27 + ph * 1.7) * 0.13 * fl + boost * 0.06;
        arr[i + 2] = rig.moteHome[i + 2] + Math.cos(time * 0.3 + ph * 0.8) * 0.1 * fl;
      }
      pa.needsUpdate = true;
      rig.moteMaterial.uniforms.uOpacity.value =
        0.85 + (currentFace === MESSAGE_FACE_INDEX ? 0.33 : 0) + boost * 0.3;
    }

    sky.galaxy.rotation.y += dt * 0.0042;
    parallaxX *= Math.pow(0.9, dt * 60);
    parallaxY *= Math.pow(0.9, dt * 60);
    sky.stars.position.set(parallaxX * 5.5, -parallaxY * 5.5, 0);
    sky.galaxy.position.set(
      sky.galaxyHome.x + parallaxX * 9,
      sky.galaxyHome.y - parallaxY * 9,
      sky.galaxyHome.z
    );

    sky.material.uniforms.uTime.value = time;
    rig.moteMaterial.uniforms.uTime.value = time;

    if (!reduced) {
      nextShoot -= dt;
      if (nextShoot <= 0) {
        sky.fireShooter();
        nextShoot = 5 + Math.random() * 7;
      }
      for (const s of sky.shooters) {
        if (s.life <= 0) continue;
        s.t += dt;
        const p = s.t / s.life;
        if (p >= 1) {
          s.life = 0;
          s.sprite.visible = false;
          s.sprite.material.opacity = 0;
          continue;
        }
        s.sprite.position.x += s.vx * dt;
        s.sprite.position.y += s.vy * dt;
        s.sprite.material.opacity = Math.sin(p * Math.PI) * 0.85;
      }
    }

    // the camera drifts on a slow sine but never rotates with the cube
    camera.position.set(
      reduced ? 0 : Math.sin(time * 0.11) * 0.16,
      reduced ? 0 : Math.cos(time * 0.083) * 0.11,
      camDist
    );
    camera.lookAt(0, 0, 0);

    if (usePost) composer.render(dt);
    else renderer.render(scene, camera);

    // Sample every 70 frames *or* every 1.5s, whichever lands first: a device
    // running at 3fps would otherwise take half a minute to reach the check.
    frames++;
    const now = performance.now();
    const elapsed = now - perfT0;
    if (frames >= 70 || elapsed >= 1500) {
      const fps = (frames * 1000) / elapsed;
      frames = 0;
      perfT0 = now;
      if (fps < 38 && perfLevel < 2) stepDown();
    }
  }
  tick();

  return {
    sound,
    toggleSound: () => sound.toggle(),
    clearFocus() {
      focusTarget = 0;
      cb.onFocusChange(false);
    },
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", layout);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      sound.dispose();
      composer.dispose();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const m = mesh.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m?.dispose();
      });
      renderer.dispose();
    },
  };
}
