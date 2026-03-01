// @ts-nocheck
import { useCallback, useEffect, useRef, useState } from "react";
import {
  analyzeSession,
  createSession,
  submitInspection,
  upsertItemObservation,
  uploadEvidence,
} from "./api/sessionApi";

const WORKER_URL =
  (import.meta.env.VITE_WORKER_URL as string | undefined) ?? "http://127.0.0.1:8787";

/* ═══════════════════════ DATA ═══════════════════════ */
const MACHINES = [
  {
    id: "m1", model: "CAT 320", serial: "ZAR00512", hours: 575.3,
    photo: "/cat320.jpeg",
    engine: "Cat C4.4", weight: "20 t", depth: "6.7 m",
  },
  {
    id: "m2", model: "CAT 834K", serial: "DKS01847", hours: 1203.7,
    photo: "/834k.jpg",
    engine: "Cat C18", weight: "65 t", depth: "—",
  },
  {
    id: "m3", model: "CAT 236D3", serial: "FMG02291", hours: 342.1,
    photo: "/236D3.jpg",
    engine: "Cat C3.8", weight: "3.8 t", depth: "—",
  },
];

const SECTIONS = [
  {
    key: "ground",
    title: "From the Ground",
    shortTitle: "Ground",
    description: "External walk-around inspection of all visible components",
    emoji: "🔍",
    items: [
      { id: "g1", name: "Bucket, GET", lookFor: "Excessive wear or damage, cracks" },
      { id: "g2", name: "Hydraulic Oil", lookFor: "Fluid level, damage, leaks" },
      { id: "g3", name: "Sticks", lookFor: "Wear, damage, leaks, lubricate" },
      { id: "g4", name: "Boom, Cylinders", lookFor: "Wear, damage, leaks, lubricate" },
      { id: "g5", name: "Underneath of Machine", lookFor: "Final drive leaks, swing drive leaks, damage" },
      { id: "g6", name: "Carbody", lookFor: "Cracks, damage" },
      { id: "g7", name: "Undercarriage", lookFor: "Wear, damage, tension" },
      { id: "g8", name: "Steps & Handholds", lookFor: "Condition & cleanliness" },
      { id: "g9", name: "Batteries & Hold Downs", lookFor: "Cleanliness, loose bolts & nuts" },
      { id: "g10", name: "Windshield Wipers & Washers", lookFor: "Wear, damage, fluid level" },
      { id: "g11", name: "Fire Extinguisher", lookFor: "Charge, damage" },
      { id: "g12", name: "Engine Coolant", lookFor: "Fluid level" },
      { id: "g13", name: "Primary/Secondary Fuel Filters", lookFor: "Leaks, drain water separator" },
      { id: "g14", name: "Air Filter", lookFor: "Restriction indicator" },
      { id: "g15", name: "Hydraulic Oil Tank", lookFor: "Fluid level, damage, leaks" },
      { id: "g16", name: "Hydraulic Oil Filter", lookFor: "Leaks" },
      { id: "g17", name: "Radiator", lookFor: "Fin blockage, leaks" },
      { id: "g18", name: "Hydraulic Oil Cooler", lookFor: "Fin blockage, leaks" },
      { id: "g19", name: "AC Condenser", lookFor: "Fin blockage, leaks" },
      { id: "g20", name: "Lights", lookFor: "Damage" },
      { id: "g21", name: "Mirrors", lookFor: "Damage, proper adjustment, cleanliness" },
      { id: "g22", name: "Engine Oil Filter", lookFor: "Leaks" },
      { id: "g23", name: "Hydraulic Oil Filters", lookFor: "Leaks" },
      { id: "g24", name: "Overall Machine", lookFor: "Loose or missing nuts & bolts, loose guards, cleanliness" },
    ],
  },
  {
    key: "engine",
    title: "Engine Compartment",
    shortTitle: "Engine",
    description: "Engine bay, platforms & fluid level checks of all visible components",
    emoji: "⚙️",
    items: [
      { id: "e1", name: "All Hoses", lookFor: "Cracks, wear spots, leaks" },
      { id: "e2", name: "Overall Engine", lookFor: "Trash or dirt buildup, leaks" },
      { id: "e3", name: "Engine Oil", lookFor: "Fluid level" },
      { id: "e4", name: "Swing Gear Oil", lookFor: "Fluid level, leaks" },
      { id: "e5", name: "Fuel Tank", lookFor: "Fuel level, damage, leaks" },
      { id: "e6", name: "DEF Tank (if equipped)", lookFor: "Fluid level, check for debris buildup" },
      { id: "e7", name: "All Belts", lookFor: "Tightness, wear, cracks" },
    ],
  },
  {
    key: "cab",
    title: "Inside the Cab",
    shortTitle: "Cab",
    description: "Cabin controls, safety systems & operator comfort",
    emoji: "🪟",
    items: [
      {
        id: "c1",
        name: "Controls",
        lookFor: "Make sure horn, travel alarm (if equipped), and all other warning devices are working properly",
      },
      { id: "c2", name: "Master Switch", lookFor: "Correct operation" },
      { id: "c3", name: "Seat", lookFor: "Adjustment, able to reach pedals" },
      { id: "c4", name: "Indicators", lookFor: "Proper function" },
      { id: "c5", name: "Monitor Panel", lookFor: "Proper function" },
      { id: "c6", name: "Switches", lookFor: "Proper function" },
      { id: "c7", name: "Travel Controls", lookFor: "Correct operation" },
      { id: "c8", name: "Mirrors", lookFor: "Proper adjustment" },
      { id: "c9", name: "Heating System", lookFor: "Proper function" },
      { id: "c10", name: "ROPS", lookFor: "Damage, loose mounting bolts" },
      { id: "c11", name: "Cooling System", lookFor: "Proper function" },
      { id: "c12", name: "Overall Cab Interior", lookFor: "Cleanliness" },
    ],
  },
];

const DEMO_ITEMS_PER_SECTION: Record<string, number> = {
  ground: 3,
  engine: 2,
  cab: 3,
};
const ACTIVE_SECTIONS = SECTIONS.map((section) => ({
  ...section,
  items: section.items.slice(0, DEMO_ITEMS_PER_SECTION[section.key] ?? 3),
}));

function hasAnyInput(
  itemId: string,
  textRemarks: Record<string, string>,
  audioRemarks: Record<string, { blob: Blob; duration: number }>,
  photos: Record<string, File[]>,
): boolean {
  return Boolean(textRemarks[itemId]?.trim()) || Boolean(audioRemarks[itemId]) || (photos[itemId]?.length ?? 0) > 0;
}

function isUnknownLike(value: unknown): boolean {
  return typeof value === "string" && value.trim().toUpperCase() === "UNKNOWN";
}

/* ═══════════════════════ SVG ICONS ═══════════════════════ */

/* ═══════════════════════ CATERPILLAR LOGO ═══════════════════════ */
function CaterpillarLogo({ dark = false }: { dark?: boolean }) {
  return (
    <svg height="38" viewBox="0 0 230 38" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Yellow CAT badge */}
      <rect x="0" y="0" width="60" height="38" rx="3" fill="#FFCB05" />
      {/* CAT letterforms — bold condensed */}
      <text x="30" y="28" textAnchor="middle" fill="#000"
        fontSize="24" fontWeight="900" fontFamily="'Arial Black', 'Impact', Arial, sans-serif"
        letterSpacing="-0.5">CAT</text>
      {/* Vertical rule */}
      <rect x="70" y="6" width="1.5" height="26" fill={dark ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.2)"} />
      {/* CATERPILLAR wordmark */}
      <text x="80" y="17" fill={dark ? "#000" : "#FFCB05"}
        fontSize="11" fontWeight="800" fontFamily="Arial, sans-serif" letterSpacing="3.5">CATERPILLAR</text>
      {/* Sub-line */}
      <text x="80" y="32" fill={dark ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.45)"}
        fontSize="8.5" fontWeight="600" fontFamily="Arial, sans-serif" letterSpacing="2.5">SAFETY INSPECTION</text>
    </svg>
  );
}

/* ═══════════════════════ GLOBAL STYLES ═══════════════════════ */
function useGlobalStyles() {
  useEffect(() => {
    const id = "catsense-global-styles";
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = `
      *, *::before, *::after { box-sizing: border-box; }
      @keyframes floatY {
        0%,100% { transform: translateY(0px); }
        50%      { transform: translateY(-12px); }
      }
      @keyframes floatSlow {
        0%,100% { transform: translateY(0px) rotate(0deg); }
        33%      { transform: translateY(-7px) rotate(1.5deg); }
        66%      { transform: translateY(5px) rotate(-1deg); }
      }
      @keyframes catGlow {
        0%,100% { box-shadow: 0 0 20px rgba(255,203,5,0.4), 0 0 40px rgba(255,203,5,0.15); }
        50%      { box-shadow: 0 0 50px rgba(255,203,5,0.75), 0 0 90px rgba(255,203,5,0.3); }
      }
      @keyframes fadeInUp {
        from { opacity:0; transform:translateY(28px); }
        to   { opacity:1; transform:translateY(0); }
      }
      @keyframes fadeIn {
        from { opacity:0; }
        to   { opacity:1; }
      }
      @keyframes spinSlow {
        from { transform:rotate(0deg); }
        to   { transform:rotate(360deg); }
      }
      @keyframes spinSlowReverse {
        from { transform:rotate(0deg); }
        to   { transform:rotate(-360deg); }
      }
      @keyframes pulseDot {
        0%,100% { transform:scale(1); opacity:1; }
        50%      { transform:scale(1.6); opacity:0.5; }
      }
      @keyframes recordPulse {
        0%,100% { transform: scale(1); }
        50% { transform: scale(1.03); }
      }
      @keyframes barBounce {
        from { transform: scaleY(0.45); opacity: 0.55; }
        to { transform: scaleY(1); opacity: 1; }
      }
      @keyframes scanLine {
        0%   { top:0%; opacity:0.7; }
        100% { top:100%; opacity:0; }
      }
      @keyframes shimmer {
        0%   { background-position:-200% center; }
        100% { background-position:200% center; }
      }
      @keyframes trackScroll {
        from { stroke-dashoffset:0; }
        to   { stroke-dashoffset:-32; }
      }
      @keyframes blink {
        0%,100% { opacity:1; }
        50%      { opacity:0.3; }
      }
      .cat-tilt-card {
        transition: transform 0.45s cubic-bezier(.25,.46,.45,.94);
        transform-style: preserve-3d;
        will-change: transform;
      }
      .shimmer-text {
        background: linear-gradient(90deg, #FFCB05 0%, #fff 45%, #FFCB05 55%, #FFCB05 100%);
        background-size: 200% auto;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        animation: shimmer 3s linear infinite;
      }
      .glass {
        background: rgba(255,255,255,0.07);
        backdrop-filter: blur(18px) saturate(180%);
        -webkit-backdrop-filter: blur(18px) saturate(180%);
        border: 1px solid rgba(255,255,255,0.13);
      }
      .glass-light {
        background: rgba(255,255,255,0.55);
        backdrop-filter: blur(14px) saturate(160%);
        -webkit-backdrop-filter: blur(14px) saturate(160%);
        border: 1px solid rgba(255,255,255,0.6);
      }
      @media print {
        @page { size: A4; margin: 12mm; }
        body { background: #fff !important; }
        .no-print { display: none !important; }
        .print-page {
          min-height: auto !important;
          padding: 0 !important;
          background: #fff !important;
        }
        .print-card {
          max-width: 100% !important;
          width: 100% !important;
          border: none !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .print-scroll {
          max-height: none !important;
          overflow: visible !important;
        }
      }
    `;
    document.head.appendChild(el);
  }, []);
}

/* ═══════════════════════ 3D TILT CARD ═══════════════════════ */
function TiltCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transition = "transform 0.08s ease";
    el.style.transform = `perspective(900px) rotateX(${-y * 14}deg) rotateY(${x * 14}deg) translateZ(8px)`;
  };
  const onLeave = () => {
    const el = ref.current; if (!el) return;
    el.style.transition = "transform 0.5s cubic-bezier(.25,.46,.45,.94)";
    el.style.transform = "perspective(900px) rotateX(0) rotateY(0) translateZ(0)";
  };
  return (
    <div ref={ref} className="cat-tilt-card" style={style} onMouseMove={onMove} onMouseLeave={onLeave}>
      {children}
    </div>
  );
}

/* ═══════════════════════ PARTICLE CANVAS ═══════════════════════ */
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf: number;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener("resize", resize);
    const particles = Array.from({ length: 55 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.8 + 0.3,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -Math.random() * 0.5 - 0.1,
      alpha: Math.random() * 0.5 + 0.1,
      color: Math.random() > 0.6 ? "255,203,5" : "148,163,184",
    }));
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx; p.y += p.vy;
        if (p.y < -4) { p.y = canvas.height + 4; p.x = Math.random() * canvas.width; }
        if (p.x < -4) p.x = canvas.width + 4;
        if (p.x > canvas.width + 4) p.x = -4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color},${p.alpha})`;
        ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />;
}

const ArrowLeft = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
  </svg>
);
const CheckSvg = ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const MicSvg = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);
const CameraSvg = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
  </svg>
);
const TrashSvg = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);
const ChevronDown = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
);

/* ═══════════════ ANIMATED EXCAVATOR SVG ═══════════════ */
function ExcavatorSVG({ width = 180 }: { width?: number }) {
  const [t, setT] = useState(0);
  const rafRef = useRef<number>();
  useEffect(() => {
    const loop = () => { setT(Date.now() / 1000); rafRef.current = requestAnimationFrame(loop); };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const W = 200, H = 140;
  // Arm kinematics — all in viewBox coords
  const pivotX = 90, pivotY = 62;
  const boomLen = 58, stickLen = 44, bucketLen = 18;
  const boomBase = -2.15 + Math.sin(t * 0.45) * 0.14;
  const stickRel  = 1.05 + Math.sin(t * 0.65 + 1.2) * 0.18;
  const bucketRel = 0.9  + Math.sin(t * 0.85 + 2.4) * 0.26;
  const bA = boomBase;
  const sA = bA + stickRel;
  const buA = sA + bucketRel;
  const bEx = pivotX + Math.cos(bA) * boomLen;
  const bEy = pivotY + Math.sin(bA) * boomLen;
  const sEx = bEx   + Math.cos(sA) * stickLen;
  const sEy = bEy   + Math.sin(sA) * stickLen;
  const buTx = sEx  + Math.cos(buA) * bucketLen;
  const buTy = sEy  + Math.sin(buA) * bucketLen;
  // Bucket scoop shape
  const buNx = sEx + Math.cos(buA + 0.7) * (bucketLen * 0.7);
  const buNy = sEy + Math.sin(buA + 0.7) * (bucketLen * 0.7);

  const trackDash = ((t * 28) % 32).toFixed(1);

  return (
    <svg width={width} height={width * (H / W)} viewBox={`0 0 ${W} ${H}`} fill="none">
      {/* Shadow */}
      <ellipse cx="100" cy="134" rx="68" ry="5" fill="rgba(0,0,0,0.18)" />

      {/* Track assembly */}
      <rect x="28" y="98" width="148" height="30" rx="15" fill="#1c1c1c" />
      <rect x="32" y="102" width="140" height="22" rx="11" fill="#111" />
      {[42, 61, 80, 99, 118, 137, 156].map((x, i) => (
        <circle key={i} cx={x} cy="113" r="7.5" fill="#1c1c1c" stroke="#383838" strokeWidth="1.5" />
      ))}
      <rect x="28" y="98" width="148" height="30" rx="15" fill="none"
        stroke="#3a3a3a" strokeWidth="2"
        strokeDasharray="10 6"
        style={{ animationName: "trackScroll", animationDuration: "0.9s", animationTimingFunction: "linear", animationIterationCount: "infinite" }}
      />

      {/* Body */}
      <rect x="42" y="60" width="118" height="42" rx="7" fill="#FFCB05" />
      <rect x="46" y="64" width="110" height="34" rx="5" fill="#E8B800" />
      {/* Body panel details */}
      <rect x="50" y="68" width="28" height="18" rx="3" fill="#D4A017" opacity="0.35" />
      <rect x="82" y="68" width="18" height="18" rx="3" fill="#D4A017" opacity="0.25" />

      {/* Cab */}
      <rect x="104" y="38" width="52" height="42" rx="6" fill="#FFCB05" stroke="#D4A017" strokeWidth="1" />
      <rect x="109" y="43" width="42" height="24" rx="3" fill="#4FC3F7" opacity="0.55" />
      <line x1="109" y1="55" x2="151" y2="55" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
      <rect x="109" y="43" width="42" height="24" rx="3" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.6" />
      {/* Cab glint */}
      <path d="M112 45 L124 43 L124 47Z" fill="rgba(255,255,255,0.35)" />

      {/* Hydraulic cylinder (boom) */}
      <line x1={pivotX + 4} y1={pivotY - 2}
            x2={pivotX + Math.cos(bA) * boomLen * 0.48 + 4}
            y2={pivotY + Math.sin(bA) * boomLen * 0.48}
            stroke="#777" strokeWidth="4" strokeLinecap="round" />
      {/* Hydraulic cylinder (stick) */}
      <line x1={bEx - Math.cos(bA) * 6} y1={bEy - Math.sin(bA) * 6}
            x2={bEx + Math.cos(sA) * stickLen * 0.44}
            y2={bEy + Math.sin(sA) * stickLen * 0.44}
            stroke="#777" strokeWidth="3" strokeLinecap="round" />

      {/* Boom */}
      <line x1={pivotX} y1={pivotY} x2={bEx} y2={bEy} stroke="#FFCB05" strokeWidth="11" strokeLinecap="round" />
      <line x1={pivotX} y1={pivotY} x2={bEx} y2={bEy} stroke="#D4A017" strokeWidth="7"  strokeLinecap="round" />
      {/* Stick */}
      <line x1={bEx} y1={bEy} x2={sEx} y2={sEy} stroke="#FFCB05" strokeWidth="9" strokeLinecap="round" />
      <line x1={bEx} y1={bEy} x2={sEx} y2={sEy} stroke="#D4A017" strokeWidth="5.5" strokeLinecap="round" />
      {/* Bucket */}
      <path d={`M${sEx.toFixed(1)} ${sEy.toFixed(1)} L${buTx.toFixed(1)} ${buTy.toFixed(1)} L${buNx.toFixed(1)} ${buNy.toFixed(1)} Z`}
            fill="#D4A017" stroke="#B8960F" strokeWidth="1.2" strokeLinejoin="round" />
      {/* Bucket teeth */}
      {[0, 0.35, 0.7].map((off, i) => {
        const tx = buTx + Math.cos(buA + off) * 5;
        const ty = buTy + Math.sin(buA + off) * 5;
        return <circle key={i} cx={tx.toFixed(1)} cy={ty.toFixed(1)} r="2" fill="#B8960F" />;
      })}

      {/* Joint pins */}
      <circle cx={pivotX} cy={pivotY} r="4.5" fill="#333" stroke="#555" strokeWidth="1" />
      <circle cx={bEx.toFixed(1)} cy={bEy.toFixed(1)} r="3.5" fill="#333" stroke="#555" strokeWidth="1" />
      <circle cx={sEx.toFixed(1)} cy={sEy.toFixed(1)} r="3" fill="#333" stroke="#555" strokeWidth="1" />

      {/* CAT badge */}
      <rect x="112" y="72" width="34" height="12" rx="2.5" fill="#D4A017" />
      <text x="129" y="81" textAnchor="middle" fontSize="8" fontWeight="900" fill="#fff" fontFamily="Arial, sans-serif" letterSpacing="1">CAT</text>

      {/* Warning beacon */}
      <circle cx="152" cy="39" r="4" fill="#FF6B00" style={{ animationName: "blink", animationDuration: "1.2s", animationTimingFunction: "ease-in-out", animationIterationCount: "infinite" }} />
    </svg>
  );
}

/* ═══════════════ SECTION ICONS ═══════════════ */
const SECTION_ICONS: Record<string, JSX.Element> = {
  ground: (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
      <circle cx="28" cy="28" r="28" fill="#FFF7E0" />
      <path d="M16 36h24" stroke="#D4A017" strokeWidth="2" strokeLinecap="round" />
      <rect x="20" y="22" width="16" height="14" rx="3" fill="#FFCB05" />
      <path d="M23 22l5-8 5 6" stroke="#B8960F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="40" r="2.5" fill="#555" /><circle cx="32" cy="40" r="2.5" fill="#555" />
    </svg>
  ),
  engine: (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
      <circle cx="28" cy="28" r="28" fill="#FFF7E0" />
      <rect x="16" y="18" width="24" height="20" rx="4" fill="#FFCB05" />
      <rect x="20" y="22" width="7" height="6" rx="1.5" fill="#B8960F" opacity="0.4" />
      <rect x="29" y="22" width="7" height="6" rx="1.5" fill="#B8960F" opacity="0.4" />
      <circle cx="23" cy="34" r="2" fill="#B8960F" opacity="0.3" />
      <circle cx="33" cy="34" r="2" fill="#B8960F" opacity="0.3" />
      <rect x="25" y="14" width="6" height="4" rx="1" fill="#E8B800" />
    </svg>
  ),
  cab: (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
      <circle cx="28" cy="28" r="28" fill="#FFF7E0" />
      <rect x="16" y="16" width="24" height="18" rx="4" fill="#FFCB05" />
      <rect x="19" y="19" width="18" height="10" rx="2" fill="#87CEEB" opacity="0.5" />
      <rect x="18" y="36" width="20" height="5" rx="2" fill="#E8B800" />
      <circle cx="23" cy="38.5" r="1.5" fill="#555" opacity="0.3" />
      <circle cx="28" cy="38.5" r="1.5" fill="#555" opacity="0.3" />
      <circle cx="33" cy="38.5" r="1.5" fill="#555" opacity="0.3" />
    </svg>
  ),
};

/* ═══════════════ SHARED UTILITIES ═══════════════ */
function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const startRecording = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder.current = new MediaRecorder(stream);
    chunks.current = [];
    mediaRecorder.current.ondataavailable = (e) => chunks.current.push(e.data);
    mediaRecorder.current.onstop = () => {
      const blob = new Blob(chunks.current, { type: "audio/webm" });
      setAudioBlob(blob);
      for (const track of stream.getTracks()) track.stop();
    };
    mediaRecorder.current.start();
    setIsRecording(true);
    setDuration(0);
    timerRef.current = window.setInterval(() => setDuration((v) => v + 1), 1000);
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current?.state === "recording") {
      mediaRecorder.current.stop();
      setIsRecording(false);
    }
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const clearBlob = useCallback(() => { setAudioBlob(null); setDuration(0); }, []);
  return { isRecording, audioBlob, duration, startRecording, stopRecording, clearBlob };
}

function fmt(s: number): string {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

/* ═══════════════ PROGRESS BAR ═══════════════ */
function ProgressBar({ value, max, large, green }: { value: number; max: number; large?: boolean; green?: boolean }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const h = large ? 10 : 6;
  return (
    <div style={{ width: "100%", height: h, background: "#e5e7eb", borderRadius: h, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: green ? "#16a34a" : "#2563eb", borderRadius: h, transition: "width 0.5s ease" }} />
    </div>
  );
}

/* ═══════════════ SYNC INDICATOR ═══════════════ */
function SyncBadge({ text }: { text: string }) {
  const isOk = text.includes("ready") || text.includes("Saved") || text.includes("synced") || text.includes("submitted");
  const isErr = text.includes("Failed") || text.includes("error") || text.includes("Error");
  return (
    <span style={{ fontSize: 11, color: "#999", display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: isErr ? "#ef4444" : isOk ? "#22c55e" : "#fbbf24" }} />
      {text}
    </span>
  );
}

/* ═══════════════ AUDIO PLAYBACK ═══════════════ */
function AudioPlayback({ audio, onDelete }: { audio: { blob: Blob; duration: number }; onDelete: () => void }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(audio.blob);
    audioRef.current = new Audio(url);
    audioRef.current.onended = () => setPlaying(false);
    return () => URL.revokeObjectURL(url);
  }, [audio.blob]);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); audioRef.current.currentTime = 0; setPlaying(false); }
    else { void audioRef.current.play(); setPlaying(true); }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, padding: "10px 14px", background: "#eff6ff", borderRadius: 10, border: "1px solid #bfdbfe" }}>
      <button onClick={toggle} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, color: "#fff", fontSize: 11 }}>
        {playing ? "■" : "▶"}
      </button>
      <div style={{ flex: 1, height: 4, background: "#bfdbfe", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: playing ? "100%" : "0%", height: "100%", background: "#2563eb", borderRadius: 2, transition: playing ? `width ${audio.duration}s linear` : "none" }} />
      </div>
      <span style={{ fontSize: 12, color: "#2563eb", fontFamily: "monospace", fontWeight: 600, flexShrink: 0 }}>{fmt(audio.duration)}</span>
      <button onClick={onDelete} aria-label="Delete audio" title="Delete audio"
        style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", opacity: 0.6, display: "flex", alignItems: "center", padding: 2 }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")} onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}>
        <TrashSvg />
      </button>
    </div>
  );
}

function ReportPhotoStrip({ files }: { files: File[] }) {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const nextUrls = files.map((file) => URL.createObjectURL(file));
    setUrls(nextUrls);

    return () => {
      for (const url of nextUrls) URL.revokeObjectURL(url);
    };
  }, [files]);

  if (urls.length === 0) {
    return null;
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {urls.map((url, idx) => (
        <img
          key={`${url}-${idx}`}
          src={url}
          alt={`Evidence ${idx + 1}`}
          style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10, border: "1px solid #d1d5db" }}
        />
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   PAGE 1 — MACHINE SELECT
   ════════════════════════════════════════════════════ */
function MachineSelectPage({ onSelect }: { onSelect: (m: any) => void }) {
  useGlobalStyles();
  const now = new Date();

  return (
    <div style={{ minHeight: "100vh", background: "#070d1a", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* ── Animated background layers ── */}
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
        {/* Radial gradient */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% 10%, rgba(255,203,5,0.12) 0%, transparent 70%)" }} />
        {/* Grid pattern */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.06 }} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#FFCB05" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
        {/* Floating orb 1 */}
        <div style={{ position: "absolute", top: "20%", left: "10%", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,203,5,0.08) 0%, transparent 70%)", animation: "floatY 7s ease-in-out infinite" }} />
        {/* Floating orb 2 */}
        <div style={{ position: "absolute", bottom: "15%", right: "8%", width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle, rgba(37,99,235,0.1) 0%, transparent 70%)", animation: "floatSlow 9s ease-in-out infinite" }} />
        <ParticleCanvas />
      </div>

      {/* ── Nav bar ── */}
      <div style={{ position: "relative", zIndex: 10, padding: "18px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <CaterpillarLogo />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", animation: "pulseDot 2s ease-in-out infinite" }} />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>
            {now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
          </span>
        </div>
      </div>

      {/* ── Hero ── */}
      <div style={{ position: "relative", zIndex: 10, textAlign: "center", padding: "52px 28px 32px" }}>
        {/* Spinning ring behind excavator */}
        <div style={{ position: "relative", display: "inline-block" }}>
          <div style={{
            position: "absolute", inset: -28,
            borderRadius: "50%",
            border: "1.5px solid rgba(255,203,5,0.18)",
            animation: "spinSlow 18s linear infinite",
          }}>
            {[0, 90, 180, 270].map((deg) => (
              <div key={deg} style={{ position: "absolute", top: "50%", left: "50%", width: 8, height: 8, borderRadius: "50%", background: "rgba(255,203,5,0.5)", transform: `rotate(${deg}deg) translateX(${(80 + 28)}px) translateY(-50%)`, }} />
            ))}
          </div>
          <div style={{
            position: "absolute", inset: -52,
            borderRadius: "50%",
            border: "1px dashed rgba(255,203,5,0.08)",
            animation: "spinSlowReverse 28s linear infinite",
          }} />
          <div style={{ animation: "floatY 4s ease-in-out infinite", filter: "drop-shadow(0 12px 32px rgba(255,203,5,0.25))" }}>
            <ExcavatorSVG width={210} />
          </div>
        </div>

        <div style={{ marginTop: 28 }}>
          <h1 className="shimmer-text" style={{ fontSize: 36, fontWeight: 900, margin: "0 0 10px", letterSpacing: "-0.025em", animation: "fadeInUp 0.7s ease both" }}>
            Safety Inspection
          </h1>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.45)", margin: 0, animation: "fadeInUp 0.7s 0.15s ease both", fontWeight: 400 }}>
            AI-powered pre-shift inspection · Select your machine to begin
          </p>
        </div>
      </div>

      {/* ── Machine cards ── */}
      <div style={{ position: "relative", zIndex: 10, maxWidth: 980, margin: "0 auto", padding: "0 28px 60px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 22 }}>
        {MACHINES.map((m, idx) => (
          <TiltCard key={m.id} style={{ borderRadius: 20, overflow: "hidden", animation: `fadeInUp 0.6s ${0.1 + idx * 0.12}s ease both`, cursor: "pointer" }}>
            <div className="glass" style={{ borderRadius: 20, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.1)" }}>
              {/* Real machine photo */}
              <div style={{ position: "relative", height: 200, overflow: "hidden" }}>
                <img
                  src={m.photo}
                  alt={m.model}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", transition: "transform 0.5s ease" }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                />
                {/* Dark gradient overlay */}
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(7,13,26,0.7) 0%, transparent 60%)" }} />
                {/* Hours badge */}
                <div style={{ position: "absolute", top: 12, right: 12, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)", padding: "4px 10px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.15)" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#FFCB05" }}>{m.hours.toLocaleString()} hrs</span>
                </div>
                {/* Status */}
                <div style={{ position: "absolute", top: 14, left: 14, display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", animation: "pulseDot 1.8s ease-in-out infinite", animationDelay: `${idx * 0.4}s` }} />
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: 700, letterSpacing: "0.06em", textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>READY</span>
                </div>
              </div>

              {/* Card body */}
              <div style={{ padding: "18px 22px 22px" }}>
                <div style={{ marginBottom: 14 }}>
                  <h3 style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: "0 0 4px", letterSpacing: "-0.01em" }}>{m.model}</h3>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0, fontFamily: "monospace", letterSpacing: "0.06em" }}>S/N: {m.serial}</p>
                </div>

                {/* Specs row */}
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  {[
                    { label: "Engine", value: m.engine },
                    { label: "Weight", value: m.weight },
                    { label: "Max Depth", value: m.depth },
                  ].map((spec) => (
                    <div key={spec.label} style={{ flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "6px 8px", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700 }}>{spec.label}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", fontWeight: 700, marginTop: 2 }}>{spec.value}</div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => onSelect(m)}
                  style={{
                    width: "100%", padding: "12px 0", borderRadius: 11, border: "none",
                    background: "linear-gradient(135deg, #FFCB05 0%, #f59e0b 100%)",
                    color: "#000", fontSize: 13, fontWeight: 800, cursor: "pointer",
                    letterSpacing: "0.06em", textTransform: "uppercase",
                    boxShadow: "0 4px 20px rgba(255,203,5,0.3)",
                    transition: "transform 0.15s, box-shadow 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 6px 28px rgba(255,203,5,0.55)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 4px 20px rgba(255,203,5,0.3)"; e.currentTarget.style.transform = "translateY(0)"; }}
                >
                  Start Inspection →
                </button>
              </div>
            </div>
          </TiltCard>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   PAGE 2 — SECTION DASHBOARD
   ════════════════════════════════════════════════════ */
function SectionDashboard({ machine, textRemarks, audioRemarks, photos, onSelectSection, onBack, onSubmit, onSaveProgress, syncState }: any) {
  useGlobalStyles();
  const totalItems = ACTIVE_SECTIONS.reduce((s, sec) => s + sec.items.length, 0);
  const completedItems = ACTIVE_SECTIONS.flatMap((sec) => sec.items).filter((item: any) =>
    hasAnyInput(item.id, textRemarks, audioRemarks, photos),
  ).length;
  const pctDone = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

  const getSectionStats = (sec: any) => {
    const done = sec.items.filter((i: any) => hasAnyInput(i.id, textRemarks, audioRemarks, photos)).length;
    return { done, total: sec.items.length };
  };

  return (
    <div style={{ minHeight: "100vh", background: "#070d1a", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Background */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(255,203,5,0.07) 0%, transparent 70%)" }} />
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.04 }}>
          <defs>
            <pattern id="grid2" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#FFCB05" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid2)" />
        </svg>
        <ParticleCanvas />
      </div>

      {/* ── Top bar ── */}
      <div style={{ position: "relative", zIndex: 10, padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(7,13,26,0.8)", backdropFilter: "blur(12px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", padding: "7px", display: "flex", color: "rgba(255,255,255,0.6)", borderRadius: 8, transition: "all 0.15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}>
            <ArrowLeft />
          </button>
          <CaterpillarLogo />
          <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.1)", marginLeft: 4 }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{machine.model}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>S/N: {machine.serial}</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Machine Hours</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#FFCB05" }}>{machine.hours} <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontWeight: 400 }}>hrs</span></div>
        </div>
      </div>

      <div style={{ position: "relative", zIndex: 10, maxWidth: 1000, margin: "0 auto", padding: "28px 28px 120px" }}>
        {/* ── Overall progress glass card ── */}
        <div className="glass" style={{ borderRadius: 18, padding: "22px 26px", marginBottom: 28, boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)", animation: "fadeInUp 0.5s ease both" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Overall Progress</div>
              <div style={{ fontSize: 30, fontWeight: 900, color: "#fff", lineHeight: 1 }}>
                {completedItems}
                <span style={{ color: "rgba(255,255,255,0.2)" }}>/{totalItems}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.4)", marginLeft: 10 }}>items inspected</span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: "#FFCB05", lineHeight: 1 }}>{Math.round(pctDone)}%</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>Complete</div>
            </div>
          </div>
          {/* Segmented animated bar */}
          <div style={{ height: 10, background: "rgba(255,255,255,0.07)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pctDone}%`, borderRadius: 10, background: "linear-gradient(90deg, #FFCB05 0%, #f59e0b 100%)", boxShadow: "0 0 16px rgba(255,203,5,0.5)", transition: "width 0.8s cubic-bezier(.25,.46,.45,.94)" }} />
          </div>
        </div>

        {/* ── Section cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(285px, 1fr))", gap: 18 }}>
          {ACTIVE_SECTIONS.map((sec, idx) => {
            const stats = getSectionStats(sec);
            const isComplete = stats.done === stats.total;
            const secPct = stats.total > 0 ? (stats.done / stats.total) * 100 : 0;
            return (
              <TiltCard key={sec.key} style={{ borderRadius: 18, animation: `fadeInUp 0.55s ${0.1 + idx * 0.1}s ease both`, cursor: "pointer" }}>
                <div className="glass" onClick={() => onSelectSection(sec.key)}
                  style={{
                    borderRadius: 18, overflow: "hidden",
                    border: isComplete ? "1.5px solid rgba(34,197,94,0.4)" : "1px solid rgba(255,255,255,0.1)",
                    boxShadow: isComplete ? "0 8px 32px rgba(34,197,94,0.15), inset 0 1px 0 rgba(255,255,255,0.08)" : "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
                  }}>

                  {/* Icon area */}
                  <div style={{ position: "relative", padding: "26px 20px 18px", display: "flex", justifyContent: "center", overflow: "hidden", background: isComplete ? "linear-gradient(145deg, rgba(34,197,94,0.12) 0%, rgba(34,197,94,0.04) 100%)" : "linear-gradient(145deg, rgba(255,203,5,0.06) 0%, rgba(255,203,5,0.02) 100%)" }}>
                    <div style={{ animationName: "floatY", animationDuration: `${3.5 + idx * 0.4}s`, animationTimingFunction: "ease-in-out", animationIterationCount: "infinite" }}>
                      {SECTION_ICONS[sec.key]}
                    </div>
                    {isComplete && (
                      <div style={{ position: "absolute", top: 10, right: 10, background: "#16a34a", borderRadius: "50%", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 12px rgba(34,197,94,0.5)" }}>
                        <CheckSvg size={13} color="#fff" />
                      </div>
                    )}
                    {!isComplete && stats.done > 0 && (
                      <div style={{ position: "absolute", top: 12, right: 12, width: 7, height: 7, borderRadius: "50%", background: "#FFCB05", animation: "pulseDot 1.6s ease-in-out infinite" }} />
                    )}
                  </div>

                  <div style={{ padding: "16px 20px 20px" }}>
                    <h3 style={{ fontSize: 13, fontWeight: 800, color: isComplete ? "#4ade80" : "#fff", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{sec.title}</h3>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "0 0 14px", lineHeight: 1.5 }}>{sec.description}</p>

                    {/* Mini progress */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>{stats.done}/{stats.total} items</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: isComplete ? "#4ade80" : "#FFCB05" }}>{Math.round(secPct)}%</span>
                    </div>
                    <div style={{ height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 5, overflow: "hidden", marginBottom: 14 }}>
                      <div style={{ height: "100%", width: `${secPct}%`, borderRadius: 5, background: isComplete ? "linear-gradient(90deg,#22c55e,#4ade80)" : "linear-gradient(90deg,#FFCB05,#f59e0b)", transition: "width 0.6s ease", boxShadow: isComplete ? "0 0 8px rgba(34,197,94,0.5)" : "0 0 8px rgba(255,203,5,0.4)" }} />
                    </div>

                    <button style={{
                      width: "100%", padding: "10px 0", borderRadius: 10, border: "none",
                      background: isComplete ? "linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.12))" : "linear-gradient(135deg, #FFCB05 0%, #f59e0b 100%)",
                      color: isComplete ? "#4ade80" : "#000",
                      fontSize: 12, fontWeight: 800, cursor: "pointer",
                      letterSpacing: "0.05em", textTransform: "uppercase",
                      boxShadow: isComplete ? "none" : "0 4px 16px rgba(255,203,5,0.3)",
                      border: isComplete ? "1px solid rgba(34,197,94,0.3)" : "none",
                      transition: "all 0.15s",
                    }}
                      onMouseEnter={(e) => { if (!isComplete) { e.currentTarget.style.boxShadow = "0 6px 24px rgba(255,203,5,0.5)"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
                      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = isComplete ? "none" : "0 4px 16px rgba(255,203,5,0.3)"; e.currentTarget.style.transform = "translateY(0)"; }}>
                      {stats.done === 0 ? "Start →" : isComplete ? "✓ Complete" : "Continue →"}
                    </button>
                  </div>
                </div>
              </TiltCard>
            );
          })}
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "14px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 90, background: "rgba(7,13,26,0.85)", backdropFilter: "blur(16px)", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <SyncBadge text={syncState} />
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onSaveProgress} style={{ padding: "9px 20px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.12)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}>
            Save Progress
          </button>
          <button onClick={onSubmit} style={{
            padding: "9px 28px", borderRadius: 9, border: "none",
            background: "linear-gradient(135deg, #16a34a, #15803d)",
            color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 4px 16px rgba(22,163,74,0.4)", transition: "all 0.15s",
          }}
            onMouseEnter={(e) => e.currentTarget.style.boxShadow = "0 6px 24px rgba(22,163,74,0.6)"}
            onMouseLeave={(e) => e.currentTarget.style.boxShadow = "0 4px 16px rgba(22,163,74,0.4)"}>
            Submit Inspection
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   PAGE 3 — INSPECTION CHECKLIST
   ════════════════════════════════════════════════════ */
function InspectionChecklist({ sectionKey, textRemarks, audioRemarks, photos, onUpdateText, onUpdateAudio, onDeleteAudio, onAddPhoto, onBack, onSaveProgress, onNextTrack, syncState }: any) {
  const section = ACTIVE_SECTIONS.find((s) => s.key === sectionKey)!;
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [recordingItemId, setRecordingItemId] = useState<string | null>(null);
  const [photoRequiredItemId, setPhotoRequiredItemId] = useState<string | null>(null);
  const { isRecording, audioBlob, duration, startRecording, stopRecording, clearBlob } = useAudioRecorder();

  useEffect(() => {
    if (audioBlob && recordingItemId) {
      void onUpdateAudio(recordingItemId, { blob: audioBlob, duration });
      clearBlob();
      setRecordingItemId(null);
    }
  }, [audioBlob, recordingItemId, duration, onUpdateAudio, clearBlob]);

  useEffect(() => {
    setExpandedItem(null);
    setPhotoRequiredItemId(null);
  }, [sectionKey]);

  const stats = { done: section.items.filter((i: any) => hasAnyInput(i.id, textRemarks, audioRemarks, photos)).length, total: section.items.length };

  return (
    <div style={{ minHeight: "100vh", background: "#070d1a", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Background */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(255,203,5,0.06) 0%, transparent 70%)" }} />
      </div>

      {/* Sticky header */}
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(7,13,26,0.88)", backdropFilter: "blur(14px)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", padding: "7px", display: "flex", color: "rgba(255,255,255,0.6)", borderRadius: 8, transition: "all 0.15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}>
            <ArrowLeft />
          </button>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{section.title}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{stats.done}/{stats.total} completed</div>
          </div>
        </div>
        {/* Progress bar in header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 140, height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 6, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${stats.total > 0 ? (stats.done / stats.total) * 100 : 0}%`, background: "linear-gradient(90deg,#FFCB05,#f59e0b)", borderRadius: 6, transition: "width 0.5s ease", boxShadow: "0 0 8px rgba(255,203,5,0.4)" }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#FFCB05", minWidth: 28 }}>{Math.round(stats.total > 0 ? (stats.done / stats.total) * 100 : 0)}%</span>
        </div>
      </div>

      <div style={{ position: "relative", zIndex: 10, maxWidth: 780, margin: "0 auto", padding: "20px 20px 100px" }}>
        {/* Section header card */}
        <div className="glass" style={{ borderRadius: 16, padding: "18px 22px", marginBottom: 16, display: "flex", alignItems: "center", gap: 18, boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)" }}>
          <div style={{ flexShrink: 0, width: 56, height: 56, borderRadius: 16, background: "rgba(255,203,5,0.12)", border: "1px solid rgba(255,203,5,0.2)", display: "flex", alignItems: "center", justifyContent: "center", animation: "floatY 4s ease-in-out infinite" }}>
            <span style={{ fontSize: 28 }}>{section.emoji}</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "rgba(255,203,5,0.6)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Inspection Checklist</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 3 }}>{section.title}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>{section.description}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#FFCB05", lineHeight: 1 }}>{stats.total}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Items</div>
          </div>
        </div>

        {/* Items */}
        {section.items.map((item: any, idx: number) => {
          const isExpanded = expandedItem === item.id;
          const hasObservation = hasAnyInput(item.id, textRemarks, audioRemarks, photos);
          const hasAudio = Boolean(audioRemarks[item.id]);
          const hasText = Boolean(textRemarks[item.id]);
          const hasPhotos = (photos[item.id] ?? []).length > 0;
          const needsPhoto = photoRequiredItemId === item.id && !hasPhotos;
          const isItemRecording = isRecording && recordingItemId === item.id;

          return (
            <div key={item.id} style={{
              background: hasObservation ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.05)",
              backdropFilter: "blur(12px)",
              borderRadius: 14, marginBottom: 8, overflow: "hidden",
              border: hasObservation ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.08)",
              transition: "all 0.25s", boxShadow: isExpanded ? "0 8px 28px rgba(0,0,0,0.4)" : "none",
            }}>
              {/* Collapsed row */}
              <div onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", cursor: "pointer", userSelect: "none" }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700,
                  background: hasObservation ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)",
                  color: hasObservation ? "#4ade80" : "rgba(255,255,255,0.3)",
                  border: `1.5px solid ${hasObservation ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.1)"}`,
                }}>
                  {hasObservation ? <CheckSvg size={14} color="#4ade80" /> : idx + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: hasObservation ? "#fff" : "rgba(255,255,255,0.8)" }}>{item.name}</div>
                  {!isExpanded && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.lookFor}</div>}
                </div>
                {!isExpanded && (
                  <div style={{ display: "flex", gap: 5, alignItems: "center", color: "rgba(255,255,255,0.4)" }}>
                    {hasAudio && <MicSvg size={13} />}
                    {hasPhotos && <CameraSvg size={13} />}
                    {hasText && <span style={{ fontSize: 12 }}>📝</span>}
                  </div>
                )}
                <span style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.25s", flexShrink: 0, display: "flex", color: "rgba(255,255,255,0.25)" }}><ChevronDown /></span>
              </div>

              {/* Expanded */}
              {isExpanded && (
                <div style={{ padding: "0 18px 18px", animation: "fadeIn 0.2s ease" }}>
                  {/* Look-for callout */}
                  <div style={{ background: "rgba(255,203,5,0.08)", border: "1px solid rgba(255,203,5,0.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 15 }}>⚠️</span>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,203,5,0.7)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Look For</div>
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>{item.lookFor}</div>
                    </div>
                  </div>

                  {/* Text remarks */}
                  <label style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Remarks</label>
                  <textarea
                    value={textRemarks[item.id] || ""}
                    onChange={(e) => onUpdateText(item.id, e.target.value, false)}
                    onBlur={(e) => onUpdateText(item.id, e.target.value, true)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Type your observations here..."
                    style={{
                      width: "100%", minHeight: 65, padding: "10px 12px",
                      background: "rgba(255,255,255,0.04)",
                      border: "1.5px solid rgba(255,255,255,0.1)", borderRadius: 10,
                      color: "#fff", fontSize: 13,
                      resize: "vertical", outline: "none", fontFamily: "inherit", lineHeight: 1.5,
                    }}
                    onFocus={(e) => { e.target.style.borderColor = "rgba(255,203,5,0.5)"; e.target.style.background = "rgba(255,255,255,0.07)"; }}
                    onBlurCapture={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; e.target.style.background = "rgba(255,255,255,0.04)"; }}
                  />

                  {/* Audio + Photo buttons */}
                  <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                    {isItemRecording ? (
                      <button onClick={(e) => { e.stopPropagation(); stopRecording(); }}
                        style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", borderRadius: 10,
                          background: "rgba(220,38,38,0.15)", border: "2px solid rgba(220,38,38,0.4)", color: "#f87171", fontSize: 12, fontWeight: 600,
                          cursor: "pointer", animation: "recordPulse 1.4s ease-in-out infinite",
                        }}>
                        <span>■</span>
                        <div style={{ display: "flex", gap: 2, alignItems: "center", height: 18 }}>
                          {[8, 14, 10, 16, 11, 13, 9].map((barHeight, i) => (
                            <div key={i} style={{
                              width: 3, height: barHeight, borderRadius: 2, background: "#f87171",
                              transformOrigin: "bottom center",
                              animation: `barBounce ${0.35 + i * 0.07}s ease-in-out infinite alternate`,
                            }} />
                          ))}
                        </div>
                        <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13 }}>{fmt(duration)}</span>
                        <span style={{ fontSize: 11 }}>Tap to stop</span>
                      </button>
                    ) : (
                      <button onClick={async (e) => { e.stopPropagation(); setRecordingItemId(item.id); await startRecording(); }}
                        style={{
                          display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10,
                          background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: 600,
                          cursor: "pointer", transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,203,5,0.5)"; e.currentTarget.style.color = "#FFCB05"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "rgba(255,255,255,0.65)"; }}>
                        <MicSvg size={15} /> Record Audio
                      </button>
                    )}

                    <label style={{
                      display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10,
                      background: needsPhoto ? "rgba(220,38,38,0.12)" : "rgba(255,255,255,0.06)",
                      border: `1.5px solid ${needsPhoto ? "rgba(220,38,38,0.4)" : "rgba(255,255,255,0.12)"}`,
                      color: needsPhoto ? "#f87171" : "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: 600,
                      cursor: "pointer", transition: "all 0.15s",
                      boxShadow: needsPhoto ? "0 0 0 3px rgba(220,38,38,0.15)" : "none",
                    }}
                      onMouseEnter={(e) => {
                        if (needsPhoto) return;
                        e.currentTarget.style.borderColor = "rgba(124,58,237,0.5)";
                        e.currentTarget.style.color = "#a78bfa";
                      }}
                      onMouseLeave={(e) => {
                        if (needsPhoto) return;
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                        e.currentTarget.style.color = "rgba(255,255,255,0.65)";
                      }}>
                      <CameraSvg size={15} /> Add Photo
                      <input type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            setPhotoRequiredItemId(null);
                            void onAddPhoto(item.id, f);
                          }
                        }} />
                    </label>
                  </div>

                  {/* Audio playback */}
                  {audioRemarks[item.id] && <AudioPlayback audio={audioRemarks[item.id]} onDelete={() => onDeleteAudio(item.id)} />}

                  {/* Photo thumbnails */}
                  {(photos[item.id] ?? []).length > 0 && (
                    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                      {(photos[item.id] ?? []).map((p: File, i: number) => (
                        <img key={`${item.id}-${i}`} src={URL.createObjectURL(p)} alt="" style={{ width: 60, height: 60, borderRadius: 8, objectFit: "cover", border: "1px solid #e5e5e5" }} />
                      ))}
                    </div>
                  )}

                  {/* Previous / Next */}
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, paddingTop: 14, borderTop: "1px solid #f0f0f0" }}>
                    <button disabled={idx === 0}
                      onClick={(e) => { e.stopPropagation(); setExpandedItem(section.items[idx - 1].id); }}
                      style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #e5e5e5", background: "#fff", color: idx === 0 ? "#ddd" : "#555", fontSize: 12, fontWeight: 600, cursor: idx === 0 ? "not-allowed" : "pointer" }}>
                      ← Previous
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!hasPhotos) {
                          setPhotoRequiredItemId(item.id);
                          return;
                        }
                        setPhotoRequiredItemId(null);
                        if (idx === section.items.length - 1) {
                          onNextTrack();
                          return;
                        }
                        setExpandedItem(section.items[idx + 1].id);
                      }}
                      style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#FFCB05,#f59e0b)", color: "#000", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      Next →
                    </button>
                  </div>
                  {needsPhoto && (
                    <div style={{ marginTop: 8, fontSize: 11, color: "#dc2626", fontWeight: 600 }}>
                      Add at least one photo to continue to the next item.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom bar */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 90, background: "rgba(7,13,26,0.88)", backdropFilter: "blur(14px)", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <SyncBadge text={syncState} />
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onBack} style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.12)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}>
            Back to Sections
          </button>
          <button onClick={onSaveProgress} style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#FFCB05,#f59e0b)", color: "#000", fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 14px rgba(255,203,5,0.3)", transition: "all 0.15s" }}
            onMouseEnter={(e) => e.currentTarget.style.boxShadow = "0 6px 22px rgba(255,203,5,0.5)"}
            onMouseLeave={(e) => e.currentTarget.style.boxShadow = "0 4px 14px rgba(255,203,5,0.3)"}>
            Save Progress
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   PAGE 4 — SUBMISSION
   ════════════════════════════════════════════════════ */
function SubmissionPage({ machine, textRemarks, photos, submitMeta, analysis, onBack }: any) {
  const aiByCheckId = new Map((analysis?.check_results ?? []).map((result: any) => [result.check_id, result]));

  const reportRows = ACTIVE_SECTIONS.flatMap((section) =>
    section.items.map((item: any) => ({
      sectionTitle: section.title,
      id: item.id,
      name: item.name,
      remark: textRemarks[item.id] ?? "",
      photos: photos[item.id] ?? [],
      ai: aiByCheckId.get(item.id) ?? null,
    })),
  ).filter((row) => row.remark || row.photos.length > 0 || row.ai);

  const statusMeta = (s: string) =>
    s === "ok"
      ? { label: "OK", bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0", dot: "#16a34a" }
      : s === "critical"
      ? { label: "CRITICAL", bg: "#fef2f2", color: "#dc2626", border: "#fecaca", dot: "#dc2626" }
      : { label: "NEEDS ATTENTION", bg: "#fffbeb", color: "#b45309", border: "#fde68a", dot: "#f59e0b" };

  const severityMeta = (s: string) =>
    s === "high"
      ? { bg: "#fef2f2", color: "#dc2626", border: "#fecaca", label: "HIGH" }
      : s === "medium"
      ? { bg: "#fffbeb", color: "#b45309", border: "#fde68a", label: "MED" }
      : { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe", label: "LOW" };

  const overallMeta = statusMeta(analysis?.overall_status ?? "ok");
  const statusCounts = (analysis?.check_results ?? []).reduce(
    (acc: { critical: number; needs_attention: number; ok: number; unknown: number }, result: any) => {
      const status = result?.analysis?.status;
      if (status === "critical") acc.critical += 1;
      else if (status === "needs_attention") acc.needs_attention += 1;
      else if (status === "ok") acc.ok += 1;
      else acc.unknown += 1;
      return acc;
    },
    { critical: 0, needs_attention: 0, ok: 0, unknown: 0 },
  );
  const submittedAt = submitMeta?.submitted_at ? new Date(submitMeta.submitted_at) : new Date();
  const generatedAt = new Date();
  const metaLeft = [
    { label: "Inspection Number", value: (submitMeta?.session_id ?? "").slice(0, 10).toUpperCase() || "N/A" },
    { label: "Serial Number", value: machine.serial ?? "N/A" },
    { label: "Make", value: "CATERPILLAR" },
    { label: "Model", value: machine.model ?? "N/A" },
    { label: "Equipment Family", value: "Excavator" },
    { label: "Asset ID", value: machine.id?.toUpperCase?.() ?? "N/A" },
    { label: "SMU", value: `${machine.hours ?? "N/A"} Hours` },
  ];
  const metaRight = [
    { label: "Work Order", value: `WO-${(submitMeta?.session_id ?? "000000").slice(0, 6).toUpperCase()}` },
    { label: "Completed On", value: submittedAt.toLocaleString() },
    { label: "Inspector", value: "Field Officer 01" },
    { label: "PDF Generated On", value: generatedAt.toLocaleDateString() },
    { label: "Location", value: "East Peoria, IL 61611" },
  ];
  const onDownloadPdf = () => {
    window.print();
  };

  return (
    <div className="print-page" style={{ minHeight: "100vh", background: "#f1f5f9", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 16px" }}>
      <div className="print-card" style={{ background: "#fff", borderRadius: 20, padding: "36px 40px", textAlign: "center", border: "1px solid #e2e8f0", maxWidth: 860, width: "100%", boxShadow: "0 12px 40px rgba(0,0,0,0.08)" }}>

        {/* Report header */}
        <div style={{ textAlign: "left", marginBottom: 26 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <h2 style={{ fontSize: "clamp(22px, 3vw, 34px)", fontWeight: 900, color: "#0f172a", margin: "0 0 2px", letterSpacing: "-0.015em" }}>
                {machine.model}: Safety & Maintenance
              </h2>
              <div style={{ fontSize: 14, color: "#475569", fontWeight: 500 }}>Daily</div>
            </div>
            <div style={{ display: "flex", border: "1px solid #e5e7eb", borderRadius: 4, overflow: "hidden", flexShrink: 0 }}>
              <div style={{ background: "#f4c21f", color: "#111827", padding: "9px 14px", fontSize: "clamp(14px, 1.8vw, 22px)", fontWeight: 900, letterSpacing: "0.03em" }}>CATSENSE</div>
              <div style={{ background: "#0f172a", color: "#fff", padding: "9px 11px", fontSize: "clamp(14px, 1.7vw, 20px)", fontWeight: 900, letterSpacing: "0.03em" }}>CAT</div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 18, marginBottom: 14 }}>
            {[
              { color: "#dc2626", value: statusCounts.critical },
              { color: "#f59e0b", value: statusCounts.needs_attention },
              { color: "#16a34a", value: statusCounts.ok },
              { color: "#9ca3af", value: statusCounts.unknown },
            ].map((item, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, color: item.color, fontWeight: 800, fontSize: 16 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: item.color, display: "inline-block" }} />
                <span>{item.value}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "6px 24px", marginBottom: 4 }}>
            <div style={{ display: "grid", gap: 8 }}>
              {metaLeft.map((entry) => (
                <div key={entry.label} style={{ display: "grid", gridTemplateColumns: "minmax(130px, 180px) 1fr", alignItems: "baseline", columnGap: 8 }}>
                  <div style={{ fontSize: "clamp(12px, 1.2vw, 15px)", color: "#6b7280", fontWeight: 500 }}>{entry.label}</div>
                  <div style={{ fontSize: "clamp(14px, 1.35vw, 17px)", color: "#111827", fontWeight: 500 }}>{entry.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {metaRight.map((entry) => (
                <div key={entry.label} style={{ display: "grid", gridTemplateColumns: "minmax(130px, 180px) 1fr", alignItems: "baseline", columnGap: 8 }}>
                  <div style={{ fontSize: "clamp(12px, 1.2vw, 15px)", color: "#6b7280", fontWeight: 500 }}>{entry.label}</div>
                  <div style={{ fontSize: "clamp(14px, 1.35vw, 17px)", color: "#111827", fontWeight: 500 }}>{entry.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI Overall Status Banner */}
        {analysis && (
          <div style={{ borderRadius: 14, padding: "16px 20px", background: overallMeta.bg, border: `1px solid ${overallMeta.border}`, marginBottom: 28, display: "flex", alignItems: "center", gap: 14, textAlign: "left" }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: overallMeta.dot, flexShrink: 0, boxShadow: `0 0 0 3px ${overallMeta.border}` }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: overallMeta.color, textTransform: "uppercase", letterSpacing: "0.08em" }}>Overall Status</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: overallMeta.color }}>{overallMeta.label}</div>
            </div>
            <div style={{ fontSize: 12, color: overallMeta.color, opacity: 0.8, textAlign: "right" }}>
              <div style={{ fontWeight: 700 }}>{analysis.analyzed_checks} checks</div>
              <div>AI-analyzed</div>
            </div>
          </div>
        )}

        {/* Detailed Report */}
        {reportRows.length > 0 && (
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 16, background: "#f8fafc", marginBottom: 28, textAlign: "left", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Detailed Report</div>
              <div style={{ marginLeft: "auto", fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{reportRows.length} items</div>
            </div>

            <div className="print-scroll" style={{ maxHeight: 520, overflowY: "auto", padding: "16px 20px", display: "grid", gap: 14 }}>
              {reportRows.map((row) => {
                const ai = row.ai?.analysis;
                const findings = Array.isArray(ai?.findings) ? ai.findings : [];
                const visibleFindings = findings.filter((f: any) =>
                  !isUnknownLike(f?.component) && !isUnknownLike(f?.issue) && !isUnknownLike(f?.evidence) && !isUnknownLike(f?.action),
                );
                const followUps = Array.isArray(ai?.follow_up_questions)
                  ? ai.follow_up_questions.filter((q: any) => typeof q === "string" && !isUnknownLike(q))
                  : [];
                const sm = ai?.status ? statusMeta(ai.status) : null;

                return (
                  <div key={row.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
                    {/* Row header */}
                    <div style={{ padding: "12px 16px", borderBottom: sm ? `2px solid ${sm.border}` : "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{row.sectionTitle}</div>
                        <div style={{ fontSize: 14, color: "#0f172a", fontWeight: 700, marginTop: 1 }}>{row.name}</div>
                      </div>
                      {sm && (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 88 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: sm.color, background: sm.bg, border: `1px solid ${sm.border}`, borderRadius: 6, padding: "2px 7px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            {sm.label}
                          </span>
                        </div>
                      )}
                    </div>

                    <div style={{ padding: "12px 16px", display: "grid", gap: 10 }}>
                      {/* Comment */}
                      {row.remark && (
                        <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.6, background: "#f8fafc", borderRadius: 8, padding: "8px 10px", borderLeft: "3px solid #cbd5e1" }}>
                          {row.remark}
                        </div>
                      )}

                      {/* Photos */}
                      {row.photos.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Evidence Photos ({row.photos.length})</div>
                          <ReportPhotoStrip files={row.photos} />
                        </div>
                      )}

                      {/* AI Summary */}
                      {ai?.summary && (
                        <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.6 }}>
                          {ai.summary}
                        </div>
                      )}

                      {/* Findings */}
                      {visibleFindings.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Findings</div>
                          <div style={{ display: "grid", gap: 8 }}>
                            {visibleFindings.map((f: any, i: number) => {
                              const sv = severityMeta(f.severity);
                              return (
                                <div key={`${row.id}-f${i}`} style={{ background: "#f8fafc", border: `1px solid ${sv.border}`, borderRadius: 10, overflow: "hidden" }}>
                                  <div style={{ background: sv.bg, padding: "7px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ fontSize: 10, fontWeight: 800, color: sv.color, background: "#fff", border: `1px solid ${sv.border}`, borderRadius: 4, padding: "1px 6px", letterSpacing: "0.06em" }}>{sv.label}</span>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{f.component}</span>
                                  </div>
                                  <div style={{ padding: "10px 12px", display: "grid", gap: 6 }}>
                                    <div style={{ fontSize: 12, color: "#1e293b", fontWeight: 600 }}>{f.issue}</div>
                                    <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5, background: "#f1f5f9", borderRadius: 6, padding: "6px 8px" }}>
                                      <span style={{ fontWeight: 700, color: "#475569" }}>Evidence: </span>{f.evidence}
                                    </div>
                                    <div style={{ fontSize: 11, color: "#0f172a", lineHeight: 1.5, background: "#fefce8", border: "1px solid #fde68a", borderRadius: 6, padding: "6px 8px" }}>
                                      <span style={{ fontWeight: 700 }}>Action: </span>{f.action}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Follow-up questions */}
                      {followUps.length > 0 && (
                        <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: "10px 12px" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#0369a1", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Follow-up Questions</div>
                          <div style={{ display: "grid", gap: 4 }}>
                            {followUps.map((q: string, i: number) => (
                              <div key={i} style={{ fontSize: 12, color: "#0c4a6e", lineHeight: 1.5, display: "flex", gap: 6 }}>
                                <span style={{ fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                                <span>{q}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="no-print" style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={onDownloadPdf} style={{
            padding: "12px 22px", borderRadius: 10, background: "linear-gradient(135deg,#16a34a,#22c55e)", color: "#fff",
            border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: "0.02em",
          }}>
            Download PDF
          </button>
          <button onClick={onBack} style={{
            padding: "12px 22px", borderRadius: 10, background: "#2563eb", color: "#fff",
            border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: "0.02em",
          }}>
            Back to Machines
          </button>
        </div>
      </div>
    </div>
  );
}

function ReportLoadingPage({ machine, syncState }: { machine: any; syncState: string }) {
  const shimmerBlock: React.CSSProperties = {
    background: "linear-gradient(90deg, #e2e8f0 0%, #f8fafc 50%, #e2e8f0 100%)",
    backgroundSize: "200% 100%",
    animation: "shimmer 1.6s linear infinite",
    borderRadius: 10,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 16px" }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "32px", border: "1px solid #e2e8f0", maxWidth: 860, width: "100%", boxShadow: "0 12px 40px rgba(0,0,0,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ ...shimmerBlock, width: 360, maxWidth: "72vw", height: 34, marginBottom: 10 }} />
            <div style={{ ...shimmerBlock, width: 190, height: 14 }} />
          </div>
          <div style={{ ...shimmerBlock, width: 170, height: 44 }} />
        </div>

        <div style={{ ...shimmerBlock, width: "100%", height: 58, marginBottom: 18 }} />
        <div style={{ fontSize: 13, color: "#64748b", fontWeight: 600, marginBottom: 20 }}>
          Generating report for {machine?.model ?? "equipment"}... {syncState}
        </div>

        {[1, 2, 3, 4].map((n) => (
          <div key={n} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
              <div style={{ ...shimmerBlock, width: "48%", height: 16 }} />
              <div style={{ ...shimmerBlock, width: 84, height: 26 }} />
            </div>
            <div style={{ ...shimmerBlock, width: "100%", height: 44, marginBottom: 8 }} />
            <div style={{ ...shimmerBlock, width: "82%", height: 30 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN APP — preserves all API integration
   ═══════════════════════════════════════════════════ */
export default function SafetyInspectionApp() {
  const [page, setPage] = useState("machines");
  const [selectedMachine, setSelectedMachine] = useState<any>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [textRemarks, setTextRemarks] = useState<Record<string, string>>({});
  const [audioRemarks, setAudioRemarks] = useState<Record<string, { blob: Blob; duration: number }>>({});
  const [photos, setPhotos] = useState<Record<string, File[]>>({});
  const [sessionId, setSessionId] = useState("");
  const [syncState, setSyncState] = useState("Not connected");
  const [submitMeta, setSubmitMeta] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);

  const requireSession = useCallback(() => {
    if (!sessionId) throw new Error("Session not initialized");
  }, [sessionId]);

  // ── API handlers (unchanged) ──
  async function onSelectMachine(machine: any): Promise<void> {
    setSelectedMachine(machine);
    setSyncState("Creating inspection session...");
    try {
      const res = await createSession({ baseUrl: WORKER_URL, equipmentId: machine.serial, checklistId: "cat-excavator-safety-v1", inspectorId: "field-officer-01" });
      setSessionId(res.session_id);
      setSyncState(`Session ready (${res.session_id.slice(0, 8)}...)`);
      setPage("dashboard");
    } catch (err) {
      setSyncState(err instanceof Error ? err.message : "Failed to create session");
      // Still navigate so UI works without backend
      setPage("dashboard");
    }
  }

  async function onUpdateText(itemId: string, value: string, syncNow: boolean): Promise<void> {
    setTextRemarks((p) => ({ ...p, [itemId]: value }));
    if (!syncNow) return;
    try {
      requireSession();
      setSyncState(`Saving ${itemId} notes...`);
      await upsertItemObservation({ baseUrl: WORKER_URL, sessionId, checkId: itemId, textRemark: value });
      setSyncState(`Saved ${itemId} notes`);
    } catch (err) {
      setSyncState(err instanceof Error ? err.message : "Failed to save notes");
    }
  }

  async function onUpdateAudio(itemId: string, value: { blob: Blob; duration: number }): Promise<void> {
    setAudioRemarks((p) => ({ ...p, [itemId]: value }));
    try {
      requireSession();
      setSyncState(`Uploading audio for ${itemId}...`);
      const audioFile = new File([value.blob], `${itemId}-${Date.now()}.webm`, { type: "audio/webm" });
      await uploadEvidence({ baseUrl: WORKER_URL, sessionId, checkId: itemId, label: "voice_note", file: audioFile });
      await upsertItemObservation({ baseUrl: WORKER_URL, sessionId, checkId: itemId, audioDurationSec: value.duration });
      setSyncState(`Audio synced for ${itemId}`);
    } catch (err) {
      setSyncState(err instanceof Error ? err.message : "Failed to upload audio");
    }
  }

  async function onAddPhoto(itemId: string, file: File): Promise<void> {
    setPhotos((p) => ({ ...p, [itemId]: [...(p[itemId] ?? []), file] }));
    try {
      requireSession();
      setSyncState(`Uploading photo for ${itemId}...`);
      await uploadEvidence({ baseUrl: WORKER_URL, sessionId, checkId: itemId, label: "inspection_photo", file });
      setSyncState(`Photo synced for ${itemId}`);
    } catch (err) {
      setSyncState(err instanceof Error ? err.message : "Failed to upload photo");
    }
  }

  async function onSubmit(): Promise<void> {
    try {
      requireSession();
      setPage("submitting");
      setSyncState("Submitting inspection...");
      const submitRes = await submitInspection(WORKER_URL, sessionId);
      setSubmitMeta(submitRes);
      try {
        setSyncState("Running multimodal analysis...");
        const analysisRes = await analyzeSession(WORKER_URL, sessionId);
        setAnalysis(analysisRes);
        setSyncState("Inspection submitted and analyzed");
      } catch {
        setAnalysis(null);
        setSyncState("Inspection submitted; analysis skipped");
      }
      setPage("submitted");
    } catch (err) {
      setSyncState(err instanceof Error ? err.message : "Failed to submit");
      setPage("dashboard");
    }
  }

  function onDeleteAudio(itemId: string): void {
    setAudioRemarks((p) => { const c = { ...p }; delete c[itemId]; return c; });
  }

  function onNextTrack(): void {
    if (!selectedSection) {
      setPage("dashboard");
      return;
    }

    const currentIndex = ACTIVE_SECTIONS.findIndex((section) => section.key === selectedSection);
    const nextSection = ACTIVE_SECTIONS[currentIndex + 1];
    if (nextSection) {
      setSelectedSection(nextSection.key);
      setSyncState(`Moving to ${nextSection.title}...`);
      return;
    }

    setPage("dashboard");
    setSyncState("Section complete. Returning to sections.");
  }

  async function onSaveProgress(): Promise<void> {
    try {
      if (sessionId) {
        setSyncState("Saving progress...");
        const pendingNotes = Object.entries(textRemarks).filter(([, value]) => Boolean(value?.trim()));
        await Promise.all(
          pendingNotes.map(([checkId, textRemark]) =>
            upsertItemObservation({ baseUrl: WORKER_URL, sessionId, checkId, textRemark }),
          ),
        );
        setSyncState("Progress saved");
      }
    } catch (err) {
      setSyncState(err instanceof Error ? err.message : "Failed to save progress");
    } finally {
      resetAll();
    }
  }

  function resetAll(): void {
    setPage("machines"); setSelectedMachine(null); setSelectedSection(null);
    setTextRemarks({}); setAudioRemarks({}); setPhotos({});
    setSessionId(""); setSubmitMeta(null); setAnalysis(null); setSyncState("Not connected");
  }

  return (
    <>
      {page === "machines" && <MachineSelectPage onSelect={onSelectMachine} />}
      {page === "dashboard" && (
        <SectionDashboard machine={selectedMachine} textRemarks={textRemarks} audioRemarks={audioRemarks} photos={photos}
          onSelectSection={(key: string) => { setSelectedSection(key); setPage("inspection"); }}
          onBack={resetAll} onSubmit={onSubmit} onSaveProgress={onSaveProgress} syncState={syncState} />
      )}
      {page === "inspection" && (
        <InspectionChecklist sectionKey={selectedSection} textRemarks={textRemarks}
          audioRemarks={audioRemarks} photos={photos} onUpdateText={onUpdateText}
          onUpdateAudio={onUpdateAudio} onDeleteAudio={onDeleteAudio} onAddPhoto={onAddPhoto}
          onBack={() => setPage("dashboard")} onSaveProgress={onSaveProgress} onNextTrack={onNextTrack} syncState={syncState} />
      )}
      {page === "submitted" && (
        <SubmissionPage machine={selectedMachine} textRemarks={textRemarks} photos={photos} submitMeta={submitMeta} analysis={analysis} onBack={resetAll} />
      )}
      {page === "submitting" && (
        <ReportLoadingPage machine={selectedMachine} syncState={syncState} />
      )}
    </>
  );
}
