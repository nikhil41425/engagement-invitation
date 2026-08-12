"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Fallback from "./Fallback";
import { FACE_ORDER } from "@/lib/content";
import type { SceneHandle } from "@/lib/scene";

interface Props {
  displayFamily: string;
  bodyFamily: string;
}

type Mode = "probing" | "gl" | "fallback";

export default function Invitation({ displayFamily, bodyFamily }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const titleTimer = useRef<number | null>(null);

  const [mode, setMode] = useState<Mode>("probing");
  const [face, setFace] = useState(0);
  const [titleShown, setTitleShown] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hintHidden, setHintHidden] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [landscape, setLandscape] = useState(false);

  /* the face title fades and slides in on each change, then fades out */
  const flashTitle = useCallback(() => {
    setTitleShown(true);
    if (titleTimer.current) window.clearTimeout(titleTimer.current);
    titleTimer.current = window.setTimeout(() => setTitleShown(false), 3400);
  }, []);

  /* a touch device held sideways gets the rotate notice */
  useEffect(() => {
    const check = () => {
      const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
      setLandscape(coarse && window.innerWidth > window.innerHeight);
    };
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", () => window.setTimeout(check, 120));
    return () => window.removeEventListener("resize", check);
  }, []);

  /* the hint disappears on first interaction, or after 20s */
  useEffect(() => {
    const t = window.setTimeout(() => setHintHidden(true), 20000);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("is-fallback", mode === "fallback");
  }, [mode]);

  useEffect(() => {
    let cancelled = false;

    function webglOK() {
      try {
        const c = document.createElement("canvas");
        return !!(
          window.WebGLRenderingContext &&
          (c.getContext("webgl") || c.getContext("experimental-webgl"))
        );
      } catch {
        return false;
      }
    }

    if (!webglOK()) {
      setMode("fallback");
      return;
    }
    setMode("gl");

    (async () => {
      // Wait for the real faces before drawing any texture, but never hang on it.
      const specs = [
        `400 100px ${displayFamily}`,
        `500 100px ${displayFamily}`,
        `600 100px ${displayFamily}`,
        `300 100px ${bodyFamily}`,
        `400 100px ${bodyFamily}`,
        `italic 300 100px ${bodyFamily}`,
      ];
      const load = document.fonts
        ? Promise.all(specs.map((s) => document.fonts.load(s).catch(() => undefined)))
        : Promise.resolve();
      await Promise.race([load, new Promise((r) => window.setTimeout(r, 2600))]);

      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const { createScene } = await import("@/lib/scene");
      if (cancelled) return;

      sceneRef.current = createScene(
        canvas,
        { display: displayFamily, body: bodyFamily },
        {
          onFaceChange: (index) => {
            setFace(index);
            flashTitle();
          },
          onFocusChange: setFocused,
          onFirstInteraction: () => setHintHidden(true),
        }
      );
      flashTitle();
    })();

    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [displayFamily, bodyFamily, flashTitle]);

  if (mode === "fallback") return <Fallback />;

  return (
    <>
      <div className="frame">
        <canvas ref={canvasRef} className="gl" />

        <div className="ui">
          <div className="mono">
            N <i>✦</i> S
          </div>

          <button
            type="button"
            className="sound"
            data-on={soundOn}
            aria-label={soundOn ? "Turn sound off" : "Turn sound on"}
            onClick={(e) => {
              e.stopPropagation();
              setSoundOn(sceneRef.current?.toggleSound() ?? false);
            }}
          >
            ♪
          </button>

          <div className="facetitle" data-show={titleShown}>
            {FACE_ORDER[face].title}
          </div>

          <div className="hint" data-hide={hintHidden} aria-hidden={hintHidden}>
            <svg width="86" height="20" viewBox="0 0 86 20" aria-hidden="true">
              <path className="trail" d="M12 10 H74" />
              <circle className="bead" cx="12" cy="10" r="3" />
            </svg>
            <p>Swipe the cube to discover our story</p>
          </div>

          <button
            type="button"
            className="back"
            data-show={focused}
            onClick={(e) => {
              e.stopPropagation();
              sceneRef.current?.clearFocus();
            }}
          >
            Back to cube
          </button>

          <div className="dots">
            {FACE_ORDER.map((f, i) => (
              <span key={f.key} data-on={i === face} />
            ))}
          </div>
        </div>
      </div>

      {landscape && (
        <div className="rotate">
          <svg width="66" height="106" viewBox="0 0 66 106" fill="none" aria-hidden="true">
            <rect
              x="1.5"
              y="1.5"
              width="63"
              height="103"
              rx="10"
              stroke="rgba(238,201,138,.55)"
              strokeWidth="1.5"
            />
            <rect x="9" y="14" width="48" height="78" rx="3" fill="rgba(238,201,138,.09)" />
            <circle cx="33" cy="98" r="2.6" fill="rgba(238,201,138,.5)" />
          </svg>
          <p>Please turn your phone upright to explore Nikhil &amp; Sravanthi&apos;s invitation.</p>
        </div>
      )}
    </>
  );
}
