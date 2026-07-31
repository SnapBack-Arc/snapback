"use client";

import { useEffect, useRef, useState } from "react";
import "./aurora.css";

type Orb = {
  x: number;
  y: number;
  size: number;
  hue: number;
  sat: number;
  light: number;
  alpha: number;
  blur: number;
  duration: number;
};

function randomOrb(): Orb {
  const r = (min: number, max: number) => min + Math.random() * (max - min);
  return {
    x: r(-15, 90),
    y: r(-15, 95),
    size: r(22, 58),
    hue: r(0, 360),
    sat: r(55, 85),
    light: r(45, 65),
    alpha: r(0.09, 0.19),
    blur: r(45, 90),
    duration: r(9, 22),
  };
}

/**
 * Shared 8-orb randomized aurora background — used by /login and / (see
 * AuroraBackgroundClient.tsx for the client-only dynamic wrapper each route
 * mounts). Not part of the root layout: every route that wants it imports
 * AuroraBackgroundClient explicitly in its own tree.
 */
export function AuroraBackground() {
  const [orbs, setOrbs] = useState<Orb[]>(() => Array.from({ length: 8 }, randomOrb));
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const schedule = (i: number) => {
      const next = randomOrb();
      setOrbs((prev) => {
        const copy = prev.slice();
        copy[i] = next;
        return copy;
      });
      timers.current[i] = setTimeout(() => schedule(i), next.duration * 1000);
    };
    orbs.forEach((_, i) => schedule(i));
    const timerList = timers.current;
    return () => timerList.forEach((t) => clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="aurora-bg fixed inset-0 z-0 overflow-hidden pointer-events-none"
      style={{ background: "#09090b" }}
    >
      {orbs.map((b, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${b.x}%`,
            top: `${b.y}%`,
            width: `${b.size}vw`,
            height: `${b.size}vw`,
            backgroundColor: `hsla(${b.hue.toFixed(0)},${b.sat.toFixed(0)}%,${b.light.toFixed(0)}%,${b.alpha.toFixed(2)})`,
            filter: `blur(${b.blur.toFixed(0)}px) brightness(var(--aurora-brightness, 1))`,
            transition: `left ${b.duration}s ease-in-out, top ${b.duration}s ease-in-out, width ${b.duration}s ease-in-out, height ${b.duration}s ease-in-out, background-color ${b.duration}s ease-in-out, filter ${b.duration}s ease-in-out`,
          }}
        />
      ))}
      <div
        className="aurora-grid absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(#ffffff14 1px, transparent 1px), linear-gradient(90deg, #ffffff14 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at 50% 0%, transparent 0%, transparent 60%, #09090b 130%)",
        }}
      />
    </div>
  );
}
