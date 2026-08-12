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
import { createCube, createStudioEnvironment } from "./cube";
import { PILL_UV, drawFaces, type Fonts } from "./faces";
import { PLINTH_TOP, createStage } from "./stage";
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

const CUBE_DIAMETER = 2.92;
const RAD_PER_PX = 0.0082;
const MAX_V = 5.5;
const QUARTER = Math.PI / 2;

/** The object turns on its vertical axis only, so its orientation is one angle
 *  rather than a quaternion: it can never end up tilted, and the settle is a
 *  snap to the nearest quarter turn. Face n sits at yaw = -n * 90 degrees. */
function faceFromYaw(yaw: number) {
  const n = Math.round(-yaw / QUARTER) % FACE_ORDER.length;
  return (n + FACE_ORDER.length) % FACE_ORDER.length;
}

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
  const envMap = createStudioEnvironment(renderer);
  const stage = createStage(dpr, reduced, envMap);
  scene.add(stage.group, ...stage.lights);

  const rig = createCube(envMap, dpr);
  const REST_Y = PLINTH_TOP + 1.02;
  rig.group.position.y = REST_Y;
  scene.add(rig.group, ...rig.lights);

  // Panels are authored on a 1024 grid; render them at more texels on retina
  // screens so a settled face is supersampled rather than mip-blurred.
  const texSize = dpr >= 2 ? 1536 : 1024;
  const faceArt = drawFaces(texSize, fonts);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const panelTexture = (canvas: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
  };
  for (const slot of Object.keys(faceArt).map(Number)) {
    const art = faceArt[slot];
    const map = panelTexture(art.map);
    rig.panels[slot].map = map;
    rig.panels[slot].emissiveMap = art.emissive ? panelTexture(art.emissive) : map;
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
    // the composition is the object plus the plinth it stands on, so the height
    // it has to clear is taller than the object's own rotational diameter
    const distH = (CUBE_DIAMETER + 1.35) / 0.88 / 2 / vhalf;
    const distW = CUBE_DIAMETER / 0.94 / 2 / (vhalf * camera.aspect);
    camDist = Math.max(distH, distW);
    camera.updateProjectionMatrix();
  }
  layout();
  window.addEventListener("resize", layout);

  // ---- interaction state ----
  let dragging = false;
  let pointerId: number | null = null;
  let lastX = 0;
  let moved = 0;
  let downT = 0;
  let lastMoveT = 0;
  let yaw = 0;
  let yawVel = 0;
  let opening = true;
  let openT = 0;
  let settled = false;
  let focus = 0;
  let focusTarget = 0;
  let parallax = 0;
  let boost = 0;
  let currentFace = 0;

  const emissive = new Array(6).fill(0.3);
  const emissiveTarget = new Array(6).fill(0.3);
  emissiveTarget[FACE_ORDER[0].slot] = 0.62;

  const sound = new Ambience();

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
    downT = performance.now();
    lastMoveT = downT;
    moved = 0;
    yawVel = 0;
    cb.onFirstInteraction();
  }

  function onMove(e: PointerEvent) {
    if (!dragging || e.pointerId !== pointerId) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    moved += Math.abs(dx);

    if (moved > 12 && focusTarget > 0) {
      focusTarget = 0;
      cb.onFocusChange(false);
    }

    // one axis: the object turns with the finger and stays upright throughout
    yaw += dx * RAD_PER_PX;

    const now = performance.now();
    const dt = Math.max(1 / 240, (now - lastMoveT) / 1000);
    lastMoveT = now;
    yawVel = THREE.MathUtils.clamp((dx * RAD_PER_PX) / dt, -MAX_V, MAX_V);

    parallax += dx * 0.0016;
    settled = false;

    if (Math.abs(dx) > 6) sound.sweep();
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
        yawVel = 0;
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
  //
  // Resolution is the last thing to give up, not the first. Dropping the pixel
  // ratio softens the type, which is the one thing the whole piece exists to
  // deliver — so effects go first, then particles, and only then resolution.
  const FULL_DPR = dpr;
  let perfLevel = 0;

  function setPixelRatio(value: number) {
    dpr = value;
    renderer.setPixelRatio(dpr);
    stage.bokehMaterial.uniforms.uSize.value = 3.0 * dpr;
    rig.moteMaterial.uniforms.uSize.value = 3.0 * dpr;
    layout();
  }

  function applyLevel(level: number) {
    perfLevel = level;
    // 1: no post   2: no loose particles   3: reduced resolution
    const wantPost = level < 1;
    if (wantPost !== usePost) {
      usePost = wantPost;
      // the composer needs its clear colour in linear space; the direct path does not
      renderer.setClearColor(usePost ? CLEAR_LINEAR : CLEAR, 1);
    }
    stage.bokeh.visible = level < 2;
    rig.motes.visible = level < 2;
    const wantDpr = level >= 3 ? Math.min(FULL_DPR, 1.5) : FULL_DPR;
    if (wantDpr !== dpr) setPixelRatio(wantDpr);
  }

  // ---- loop ----
  const clock = new THREE.Clock();
  const bootedAt = performance.now();
  let frames = 0;
  let perfT0 = bootedAt;
  let bad = 0;
  let good = 0;
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
      // before the first touch the object turns gently on its own, which shows
      // its depth and makes the swipe affordance obvious without a caption
      openT += dt;
      let ease = Math.min(1, openT / 1.6);
      ease = 1 - Math.pow(1 - ease, 3);
      yaw = reduced ? 0.3 : Math.sin(time * 0.62) * 0.349 * ease;
      settled = false;
    } else if (!dragging) {
      if (Math.abs(yawVel) > 0.0005) {
        yaw += yawVel * dt;
        yawVel *= Math.pow(0.955, dt * 60);
      }
      if (Math.abs(yawVel) < 0.35) {
        // settle on the nearest quarter turn, so a face is always square on
        const target = Math.round(yaw / QUARTER) * QUARTER;
        yaw += (target - yaw) * (1 - Math.exp(-(reduced ? 14 : 8.5) * dt));
        yawVel *= 0.7;
        settled = Math.abs(target - yaw) < 0.002;
      }
    }
    rig.rotor.rotation.y = yaw;

    setActiveFace(faceFromYaw(yaw));

    const fl = reduced ? 0 : 1;
    rig.group.position.y = REST_Y + Math.sin(time * 0.5) * 0.045 * fl;

    focus += (focusTarget - focus) * (1 - Math.exp(-6 * dt));
    rig.group.position.z = focus * camDist * 0.13;

    // The pulse on each face change used to be spent on the object's own glow
    // shells. It is spent on the stage now: the pool the plinth stands in and
    // the spill toward the viewer both lift, so the light still answers the
    // turn — it just comes from the room rather than from the object's edges.
    boost += (0 - boost) * (1 - Math.exp(-2.2 * dt));
    const breathe = 0.5 + 0.5 * Math.sin(time * 0.7);
    stage.bokehMaterial.uniforms.uBoost.value = boost * 0.85;
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

    // the stage breathes with the drag: bokeh and the pool of light shift a
    // little and settle back, so the object never feels stuck to the backdrop
    parallax *= Math.pow(0.9, dt * 60);
    stage.group.position.x = parallax * 1.4;
    (stage.glowPool.material as THREE.MeshBasicMaterial).opacity =
      0.78 + breathe * 0.18 + boost * 0.46;
    (stage.smear.material as THREE.MeshBasicMaterial).opacity =
      0.82 + breathe * 0.14 + boost * 0.38;

    if (stage.bokeh.visible) {
      const pa = stage.bokeh.geometry.getAttribute("position") as THREE.BufferAttribute;
      const arr = pa.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        const ph = i * 0.21;
        arr[i] = stage.bokehHome[i] + Math.sin(time * 0.16 + ph) * 0.5 * fl;
        arr[i + 1] = stage.bokehHome[i + 1] + ((time * 0.16 + ph) % 6) * fl * 0.4;
        arr[i + 2] = stage.bokehHome[i + 2] + Math.cos(time * 0.13 + ph) * 0.4 * fl;
      }
      pa.needsUpdate = true;
    }

    stage.bokehMaterial.uniforms.uTime.value = time;
    rig.moteMaterial.uniforms.uTime.value = time;

    // the camera drifts on a slow sine but never rotates with the cube
    camera.position.set(
      reduced ? 0 : Math.sin(time * 0.11) * 0.1,
      REST_Y + 0.42 + (reduced ? 0 : Math.cos(time * 0.083) * 0.05),
      camDist
    );
    camera.lookAt(0, REST_Y - 0.24, 0);

    if (usePost) composer.render(dt);
    else renderer.render(scene, camera);

    // Sample every 70 frames *or* every 1.5s, whichever lands first, so a
    // device running at 3fps is rescued in a second rather than half a minute.
    // The first few seconds are ignored: shader compilation, texture upload and
    // font work all land there, and judging the device on that would strip the
    // piece down permanently over a hitch that has already passed. Two bad
    // samples are needed to step down, and a sustained good run steps back up.
    frames++;
    const now = performance.now();
    const elapsed = now - perfT0;
    if (now - bootedAt < 3000) {
      frames = 0;
      perfT0 = now;
    } else if (frames >= 70 || elapsed >= 1500) {
      const fps = (frames * 1000) / elapsed;
      frames = 0;
      perfT0 = now;
      if (fps < 38) {
        good = 0;
        if (++bad >= 2 && perfLevel < 3) {
          applyLevel(perfLevel + 1);
          bad = 0;
        }
      } else if (fps > 54) {
        bad = 0;
        if (++good >= 4 && perfLevel > 0) {
          applyLevel(perfLevel - 1);
          good = 0;
        }
      } else {
        bad = 0;
        good = 0;
      }
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
