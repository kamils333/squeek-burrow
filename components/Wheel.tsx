"use client";

import { useEffect, useRef } from "react";

// Hamster wheel drawn in SVG. It spins at the real wheel's rpm while Squeektoshi runs.
export default function Wheel({ rpm, running }: { rpm: number; running: boolean }) {
  const spokesRef = useRef<SVGGElement>(null);
  const rpmRef = useRef(0);
  const angle = useRef(0);

  useEffect(() => {
    rpmRef.current = running ? rpm : 0;
  }, [rpm, running]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let shown = 0; // eased rpm so the wheel speeds up / slows down smoothly
    const tick = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      shown += (rpmRef.current - shown) * Math.min(1, dt * 2);
      angle.current = (angle.current + (shown / 60) * 360 * dt) % 360;
      spokesRef.current?.setAttribute("transform", `rotate(${angle.current} 150 150)`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const spokes = Array.from({ length: 12 }, (_, i) => i * 30);

  return (
    <svg viewBox="0 0 300 300" className="wheel" role="img" aria-label={running ? "Squeektoshi is running" : "Squeektoshi is resting"}>
      {/* stand */}
      <path d="M150 150 L95 285 M150 150 L205 285" stroke="var(--line)" strokeWidth="8" strokeLinecap="round" />
      <rect x="70" y="280" width="160" height="10" rx="5" fill="var(--line)" />
      {/* rotating rim */}
      <g ref={spokesRef}>
        <circle cx="150" cy="150" r="120" fill="none" stroke="var(--accent)" strokeWidth="10" />
        <circle cx="150" cy="150" r="108" fill="none" stroke="var(--accent-dim)" strokeWidth="3" />
        {spokes.map((a) => (
          <line
            key={a}
            x1="150"
            y1="150"
            x2={150 + 120 * Math.cos((a * Math.PI) / 180)}
            y2={150 + 120 * Math.sin((a * Math.PI) / 180)}
            stroke="var(--accent-dim)"
            strokeWidth="2"
          />
        ))}
        {spokes.map((a) => (
          <circle
            key={"r" + a}
            cx={150 + 114 * Math.cos(((a + 15) * Math.PI) / 180)}
            cy={150 + 114 * Math.sin(((a + 15) * Math.PI) / 180)}
            r="3"
            fill="var(--accent)"
          />
        ))}
      </g>
      <circle cx="150" cy="150" r="9" fill="var(--line)" />
      {/* hamster (stays at the bottom of the wheel) */}
      <g className={running ? "hamster run" : "hamster"} transform="translate(150 228)">
        <ellipse cx="0" cy="0" rx="38" ry="27" fill="#e9a55b" />
        <ellipse cx="6" cy="8" rx="24" ry="15" fill="#fbe3c2" />
        <circle cx="30" cy="-10" r="17" fill="#e9a55b" />
        <ellipse cx="38" cy="-2" rx="9" ry="7" fill="#fbe3c2" />
        <circle cx="22" cy="-27" r="7" fill="#e9a55b" />
        <circle cx="22" cy="-27" r="3.5" fill="#f2a0a0" />
        <circle cx="36" cy="-13" r="3" fill="#1d1d1d" />
        <circle cx="37" cy="-14" r="1" fill="#fff" />
        <circle cx="47" cy="-6" r="2.5" fill="#d9707a" />
        <ellipse cx="-14" cy="25" rx="6" ry="4" fill="#f2b9a0" className="leg back" />
        <ellipse cx="18" cy="25" rx="6" ry="4" fill="#f2b9a0" className="leg front" />
        {!running && (
          <text x="-30" y="-36" fontSize="16" fill="var(--muted)" fontFamily="monospace">
            z z z
          </text>
        )}
      </g>
    </svg>
  );
}
