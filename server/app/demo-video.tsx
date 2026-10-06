"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./page.module.css";

const WIDE = { mp4: "/media/pulso-demo-16x9.mp4", webm: "/media/pulso-demo-16x9.webm", poster: "/media/pulso-demo-16x9.jpg" };
const TALL = { mp4: "/media/pulso-demo-9x16.mp4", webm: "/media/pulso-demo-9x16.webm", poster: "/media/pulso-demo-9x16.jpg" };

/**
 * The 30-second promo (videos/pulso-hero). Muted, looping, inline: the only way a
 * browser lets video start on its own. Phones in portrait get the vertical cut. It
 * plays only while on screen, never starts by itself under "reduce motion", and
 * always has a pause button (moving content longer than 5 s must be pausable).
 */
export function DemoVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [tall, setTall] = useState(false);
  const [paused, setPaused] = useState(true);
  const [userPaused, setUserPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Pick the cut once, before the first frame loads; a rotation later keeps the loaded one.
  useEffect(() => {
    setTall(window.matchMedia("(max-width: 700px) and (orientation: portrait)").matches);
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || reducedMotion || userPaused) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) video.play().catch(() => setPaused(true));
      else video.pause();
    }, { threshold: 0.35 });
    observer.observe(video);
    return () => observer.disconnect();
  }, [reducedMotion, userPaused, tall]);

  function toggle() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      setUserPaused(false);
      video.play().catch(() => setPaused(true));
    } else {
      setUserPaused(true);
      video.pause();
    }
  }

  const source = tall ? TALL : WIDE;
  return (
    <div className={tall ? `${styles.demoFrame} ${styles.demoFrameTall}` : styles.demoFrame}>
      <video
        key={tall ? "tall" : "wide"}
        ref={videoRef}
        className={styles.demoVideo}
        poster={source.poster}
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="Video de demostración de PULSO: registrar una serie, ver tu récord, comidas, agua, sueño y los mensajes de tu entrenador."
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
      >
        <source src={source.webm} type="video/webm" />
        <source src={source.mp4} type="video/mp4" />
      </video>
      <button type="button" className={styles.demoToggle} onClick={toggle} aria-label={paused ? "Reproducir video" : "Pausar video"}>
        {paused ? (
          <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M6 4l10 6-10 6z" fill="currentColor" /></svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M5 4h3.5v12H5zM11.5 4H15v12h-3.5z" fill="currentColor" /></svg>
        )}
        <span>{paused ? "REPRODUCIR" : "PAUSA"}</span>
      </button>
    </div>
  );
}
