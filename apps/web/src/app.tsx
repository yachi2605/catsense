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
  { id: "m1", model: "CAT 320", serial: "ZAR00512", hours: 575.3 },
  { id: "m2", model: "CAT 336", serial: "DKS01847", hours: 1203.7 },
  { id: "m3", model: "CAT 352", serial: "FMG02291", hours: 342.1 },
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
      { id: "g2", name: "Bucket Cylinder & Linkage", lookFor: "Excessive wear, damage, leaks, lubricate" },
      { id: "g3", name: "Stick, Cylinder", lookFor: "Wear, damage, leaks, lubricate" },
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
    description: "Engine bay, platforms & fluid level checks",
    emoji: "⚙️",
    items: [
      { id: "e1", name: "Engine Oil", lookFor: "Fluid level" },
      { id: "e2", name: "Swing Gear Oil", lookFor: "Fluid level, leaks" },
      { id: "e3", name: "Fuel Tank", lookFor: "Fuel level, damage, leaks" },
      { id: "e4", name: "DEF Tank (if equipped)", lookFor: "Fluid level, check for debris buildup" },
      { id: "e5", name: "All Hoses", lookFor: "Cracks, wear spots, leaks" },
      { id: "e6", name: "All Belts", lookFor: "Tightness, wear, cracks" },
      { id: "e7", name: "Overall Engine Compartment", lookFor: "Trash or dirt buildup, leaks" },
    ],
  },
  {
    key: "cab",
    title: "Inside the Cab",
    shortTitle: "Cab",
    description: "Cabin controls, safety systems & operator comfort",
    emoji: "🪟",
    items: [
      { id: "c1", name: "Seat", lookFor: "Adjustment, able to reach pedals" },
      { id: "c2", name: "Seat Belt & Mounting", lookFor: "Damage, wear, adjustment, installed date, age" },
      { id: "c3", name: "Horn, Travel Alarm, Lights", lookFor: "Proper function of all warning devices" },
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

const DEMO_ITEMS_PER_SECTION = 3;
const ACTIVE_SECTIONS = SECTIONS.map((section) => ({
  ...section,
  items: section.items.slice(0, DEMO_ITEMS_PER_SECTION),
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
const ChevronDown = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
);

/* ═══════════════ EXCAVATOR SVG ═══════════════ */
function ExcavatorSVG({ width = 180 }: { width?: number }) {
  return (
    <svg width={width} height={width * 0.7} viewBox="0 0 200 140" fill="none">
      <rect x="30" y="100" width="140" height="28" rx="14" fill="#2d2d2d" />
      <rect x="34" y="104" width="132" height="20" rx="10" fill="#1a1a1a" />
      {[44, 60, 76, 92, 108, 124, 140, 156].map((x, i) => (
        <circle key={i} cx={x} cy="114" r="6" fill="#2d2d2d" stroke="#444" strokeWidth="1" />
      ))}
      <rect x="45" y="62" width="110" height="40" rx="6" fill="#FFCB05" />
      <rect x="48" y="65" width="104" height="34" rx="4" fill="#E8B800" />
      <rect x="100" y="42" width="48" height="38" rx="4" fill="#FFCB05" stroke="#D4A017" strokeWidth="1" />
      <rect x="104" y="46" width="40" height="24" rx="3" fill="#87CEEB" opacity="0.6" />
      <rect x="104" y="46" width="40" height="24" rx="3" stroke="#999" strokeWidth="0.5" />
      <path d="M95 60L55 25L30 50" stroke="#FFCB05" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M95 60L55 25L30 50" stroke="#D4A017" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M30 50L15 80" stroke="#FFCB05" strokeWidth="6" strokeLinecap="round" />
      <path d="M30 50L15 80" stroke="#D4A017" strokeWidth="4" strokeLinecap="round" />
      <path d="M15 80L5 90L20 95L25 85Z" fill="#D4A017" stroke="#B8960F" strokeWidth="1" />
      <line x1="85" y1="72" x2="50" y2="35" stroke="#888" strokeWidth="3" strokeLinecap="round" />
      <line x1="45" y1="38" x2="22" y2="60" stroke="#888" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="90" y="50" width="4" height="12" rx="2" fill="#555" />
      <rect x="110" y="72" width="30" height="10" rx="2" fill="#D4A017" />
      <text x="125" y="80" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#fff" fontFamily="Arial">CAT</text>
      <rect x="148" y="66" width="8" height="30" rx="2" fill="#D4A017" />
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
      <button onClick={onDelete} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 12, opacity: 0.6 }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")} onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}>
        Delete
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
  const now = new Date();
  return (
    <div style={{ minHeight: "100vh", background: "#f4f5f7" }}>
      {/* Top bar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ background: "#FFCB05", padding: "5px 10px", borderRadius: 4 }}>
            <span style={{ fontWeight: 900, fontSize: 16, color: "#000", letterSpacing: 1 }}>CAT</span>
          </div>
          <div style={{ height: 24, width: 1, background: "#e5e5e5" }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>Safety Inspection Platform</span>
        </div>
        <div style={{ fontSize: 13, color: "#999" }}>{now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "48px 28px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#111", margin: "0 0 6px", letterSpacing: "-0.02em" }}>Welcome to CAT Safety Inspection</h1>
        <p style={{ fontSize: 15, color: "#777", margin: "0 0 36px" }}>Select an excavator to begin the pre-shift inspection.</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
          {MACHINES.map((m) => (
            <div key={m.id} style={{
              background: "#fff", borderRadius: 16, overflow: "hidden", border: "1px solid #e8e8e8",
              transition: "all 0.2s", cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 28px rgba(0,0,0,0.08)"; e.currentTarget.style.transform = "translateY(-3px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)"; e.currentTarget.style.transform = "translateY(0)"; }}>

              <div style={{ background: "linear-gradient(145deg, #fafafa, #f0f0f0)", padding: "28px 20px 16px", display: "flex", justifyContent: "center", position: "relative" }}>
                <ExcavatorSVG width={170} />
                <div style={{ position: "absolute", top: 12, right: 12, background: "#fff", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, color: "#666", border: "1px solid #eee" }}>
                  {m.hours} hrs
                </div>
              </div>

              <div style={{ padding: "16px 20px 20px" }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#111", margin: "0 0 3px" }}>{m.model}</h3>
                <p style={{ fontSize: 12, color: "#aaa", margin: "0 0 16px", fontFamily: "monospace" }}>S/N: {m.serial}</p>
                <button onClick={() => onSelect(m)} style={{
                  width: "100%", padding: "11px 0", borderRadius: 10, border: "none",
                  background: "#2563eb", color: "#fff", fontSize: 13, fontWeight: 700,
                  cursor: "pointer", transition: "background 0.15s", letterSpacing: "0.03em",
                }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#1d4ed8")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#2563eb")}>
                  START INSPECTION
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   PAGE 2 — SECTION DASHBOARD
   ════════════════════════════════════════════════════ */
function SectionDashboard({ machine, textRemarks, audioRemarks, photos, onSelectSection, onBack, onSubmit, onSaveProgress, syncState }: any) {
  const totalItems = ACTIVE_SECTIONS.reduce((s, sec) => s + sec.items.length, 0);
  const completedItems = ACTIVE_SECTIONS.flatMap((sec) => sec.items).filter((item: any) =>
    hasAnyInput(item.id, textRemarks, audioRemarks, photos),
  ).length;

  const getSectionStats = (sec: any) => {
    const done = sec.items.filter((i: any) => hasAnyInput(i.id, textRemarks, audioRemarks, photos)).length;
    return { done, total: sec.items.length };
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f4f5f7" }}>
      {/* Top bar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 6, display: "flex", color: "#666", borderRadius: 8 }}><ArrowLeft /></button>
          <div style={{ background: "#FFCB05", padding: "5px 10px", borderRadius: 4 }}>
            <span style={{ fontWeight: 900, fontSize: 15, color: "#000", letterSpacing: 1 }}>CAT</span>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{machine.model}</div>
            <div style={{ fontSize: 11, color: "#aaa", fontFamily: "monospace" }}>S/N: {machine.serial}</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Machine Hours</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#111" }}>{machine.hours} <span style={{ fontSize: 12, color: "#aaa", fontWeight: 400 }}>hrs</span></div>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 28px 120px" }}>
        {/* Overall progress */}
        <div style={{ background: "#fff", borderRadius: 16, padding: "22px 24px", marginBottom: 28, border: "1px solid #e8e8e8" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: "#aaa", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Overall Progress</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: "#111" }}>
                {completedItems}<span style={{ color: "#ddd" }}>/{totalItems}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: "#aaa", marginLeft: 8 }}>items inspected</span>
              </div>
            </div>
            <div />
          </div>
          <ProgressBar value={completedItems} max={totalItems} large />
        </div>

        {/* Section cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 18 }}>
          {ACTIVE_SECTIONS.map((sec) => {
            const stats = getSectionStats(sec);
            const isComplete = stats.done === stats.total;
            return (
              <div key={sec.key} onClick={() => onSelectSection(sec.key)}
                style={{
                  background: "#fff", borderRadius: 16, overflow: "hidden", cursor: "pointer",
                  border: isComplete ? "2px solid #bbf7d0" : "1px solid #e8e8e8",
                  transition: "all 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 6px 24px rgba(0,0,0,0.07)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.03)"; e.currentTarget.style.transform = "translateY(0)"; }}>

                <div style={{ background: isComplete ? "linear-gradient(135deg, #f0fdf4, #ecfdf5)" : "linear-gradient(145deg, #fafafa, #f3f3f3)", padding: 24, display: "flex", justifyContent: "center", position: "relative" }}>
                  {SECTION_ICONS[sec.key]}
                  {isComplete && (
                    <div style={{ position: "absolute", top: 10, right: 10, background: "#16a34a", borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <CheckSvg size={13} color="#fff" />
                    </div>
                  )}
                </div>

                <div style={{ padding: "16px 20px 20px" }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{sec.title}</h3>
                  <p style={{ fontSize: 11, color: "#aaa", margin: "0 0 14px", lineHeight: 1.4 }}>{sec.description}</p>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#666" }}>{stats.done}/{stats.total}</span>
                  </div>
                  <ProgressBar value={stats.done} max={stats.total} green={isComplete} />
                  <button style={{
                    width: "100%", marginTop: 14, padding: "9px 0", borderRadius: 8,
                    background: isComplete ? "#f0fdf4" : "#2563eb", color: isComplete ? "#16a34a" : "#fff",
                    border: isComplete ? "1px solid #bbf7d0" : "none",
                    fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s", letterSpacing: "0.02em",
                  }}
                    onMouseEnter={(e) => !isComplete && (e.currentTarget.style.background = "#1d4ed8")}
                    onMouseLeave={(e) => !isComplete && (e.currentTarget.style.background = "#2563eb")}>
                    {stats.done === 0 ? "START INSPECTION" : isComplete ? "✓ COMPLETE" : "CONTINUE"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #e5e7eb", padding: "14px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 90 }}>
        <SyncBadge text={syncState} />
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onSaveProgress} style={{ padding: "9px 20px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", color: "#555", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Save Progress</button>
          <button onClick={onSubmit} style={{
            padding: "9px 28px", borderRadius: 8, border: "none",
            background: "#16a34a", color: "#fff",
            fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>Submit Inspection</button>
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
    <div style={{ minHeight: "100vh", background: "#f4f5f7" }}>
      {/* Sticky header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 6, display: "flex", color: "#666", borderRadius: 8 }}><ArrowLeft /></button>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>{section.title}</div>
            <div style={{ fontSize: 11, color: "#aaa" }}>{stats.done}/{stats.total} completed</div>
          </div>
        </div>
        <div style={{ width: 160 }}><ProgressBar value={stats.done} max={stats.total} /></div>
      </div>

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "20px 20px 100px" }}>
        {/* Section header card */}
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e8e8e8", padding: "16px 24px 12px", marginBottom: 16, display: "flex", alignItems: "center", gap: 20 }}>
          <ExcavatorSVG width={100} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#111", marginBottom: 2 }}>{section.title}</div>
            <div style={{ fontSize: 13, color: "#888", lineHeight: 1.4 }}>{section.description}</div>
            <div style={{ fontSize: 12, color: "#bbb", marginTop: 6 }}>{stats.total} inspection items</div>
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
              background: "#fff", borderRadius: 14, marginBottom: 8, overflow: "hidden",
              border: `1px solid ${hasObservation ? "#bbf7d0" : "#e8e8e8"}`,
              transition: "all 0.2s", boxShadow: isExpanded ? "0 4px 16px rgba(0,0,0,0.05)" : "none",
            }}>
              {/* Collapsed row */}
              <div onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", cursor: "pointer", userSelect: "none" }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700,
                  background: hasObservation ? "#f0fdf4" : "#f5f5f5", color: hasObservation ? "#16a34a" : "#ccc",
                  border: `1.5px solid ${hasObservation ? "#bbf7d0" : "#e5e5e5"}`,
                }}>
                  {hasObservation ? <CheckSvg size={14} color="#16a34a" /> : idx + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#222" }}>{item.name}</div>
                  {!isExpanded && <div style={{ fontSize: 11, color: "#bbb", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.lookFor}</div>}
                </div>
                {!isExpanded && (
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    {hasAudio && <MicSvg size={13} />}
                    {hasPhotos && <CameraSvg size={13} />}
                    {hasText && <span style={{ fontSize: 12 }}>📝</span>}
                  </div>
                )}
                <span style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.25s", flexShrink: 0, display: "flex" }}><ChevronDown /></span>
              </div>

              {/* Expanded */}
              {isExpanded && (
                <div style={{ padding: "0 18px 18px", animation: "fadeSlideIn 0.2s ease" }}>
                  {/* Look-for callout */}
                  <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 15 }}>⚠️</span>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Look For</div>
                      <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.5 }}>{item.lookFor}</div>
                    </div>
                  </div>

                  {/* Text remarks */}
                  <label style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Remarks</label>
                  <textarea
                    value={textRemarks[item.id] || ""}
                    onChange={(e) => onUpdateText(item.id, e.target.value, false)}
                    onBlur={(e) => onUpdateText(item.id, e.target.value, true)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Type your observations here..."
                    style={{
                      width: "100%", minHeight: 65, padding: "10px 12px", background: "#fafafa",
                      border: "1.5px solid #e5e5e5", borderRadius: 10, color: "#333", fontSize: 13,
                      resize: "vertical", outline: "none", fontFamily: "inherit", lineHeight: 1.5,
                    }}
                    onFocus={(e) => { e.target.style.borderColor = "#2563eb"; e.target.style.background = "#fff"; }}

                  />

                  {/* Audio + Photo buttons */}
                  <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                    {isItemRecording ? (
                      <button onClick={(e) => { e.stopPropagation(); stopRecording(); }}
                        style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", borderRadius: 10,
                          background: "#fef2f2", border: "2px solid #fecaca", color: "#dc2626", fontSize: 12, fontWeight: 600,
                          cursor: "pointer", animation: "pulse 1.5s infinite",
                        }}>
                        <span>■</span>
                        <div style={{ display: "flex", gap: 2, alignItems: "center", height: 18 }}>
                          {[...Array(7)].map((_, i) => (
                            <div key={i} style={{ width: 3, borderRadius: 2, background: "#dc2626", animation: `barBounce ${0.35 + i * 0.07}s ease-in-out infinite alternate` }} />
                          ))}
                        </div>
                        <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13 }}>{fmt(duration)}</span>
                        <span style={{ fontSize: 11 }}>Tap to stop</span>
                      </button>
                    ) : (
                      <button onClick={async (e) => { e.stopPropagation(); setRecordingItemId(item.id); await startRecording(); }}
                        style={{
                          display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10,
                          background: "#fff", border: "1.5px solid #e5e5e5", color: "#555", fontSize: 12, fontWeight: 600,
                          cursor: "pointer", transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#2563eb"; e.currentTarget.style.color = "#2563eb"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e5e5e5"; e.currentTarget.style.color = "#555"; }}>
                        <MicSvg size={15} /> Record Audio
                      </button>
                    )}

                    <label style={{
                      display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10,
                      background: needsPhoto ? "#fef2f2" : "#fff",
                      border: `1.5px solid ${needsPhoto ? "#dc2626" : "#e5e5e5"}`,
                      color: needsPhoto ? "#dc2626" : "#555", fontSize: 12, fontWeight: 600,
                      cursor: "pointer", transition: "all 0.15s",
                      boxShadow: needsPhoto ? "0 0 0 3px rgba(220,38,38,0.15)" : "none",
                    }}
                      onMouseEnter={(e) => {
                        if (needsPhoto) return;
                        e.currentTarget.style.borderColor = "#7c3aed";
                        e.currentTarget.style.color = "#7c3aed";
                      }}
                      onMouseLeave={(e) => {
                        if (needsPhoto) return;
                        e.currentTarget.style.borderColor = "#e5e5e5";
                        e.currentTarget.style.color = "#555";
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
                      style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
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
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #e5e7eb", padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 90 }}>
        <SyncBadge text={syncState} />
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onBack} style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", color: "#555", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Back to Sections</button>
          <button onClick={onSaveProgress} style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Save Progress</button>
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

  return (
    <div style={{ minHeight: "100vh", background: "#f4f5f7", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "36px 42px", textAlign: "center", border: "1px solid #e8e8e8", maxWidth: 900, width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.06)" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#f0fdf4", border: "2px solid #bbf7d0", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <CheckSvg size={28} color="#16a34a" />
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: "#111", margin: "0 0 6px" }}>Inspection Submitted</h2>
        <p style={{ fontSize: 13, color: "#999", margin: "0 0 28px" }}>{machine.model} · S/N: {machine.serial}</p>

        <div style={{ display: "flex", gap: 14, justifyContent: "center", marginBottom: 24 }}>
          {[
            { l: "Observed Items", v: submitMeta?.summary?.total_items_with_observation ?? 0, c: "#2563eb" },
            { l: "Text Notes", v: submitMeta?.summary?.text_remark_count ?? 0, c: "#16a34a" },
            { l: "Audio Notes", v: submitMeta?.summary?.audio_remark_count ?? 0, c: "#dc2626" },
          ].map((s) => (
            <div key={s.l} style={{ background: "#f9fafb", borderRadius: 12, padding: "12px 16px", minWidth: 65, border: "1px solid #f0f0f0" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: s.c }}>{s.v}</div>
              <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, marginTop: 2 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* AI Analysis results if available */}
        {analysis && (
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "16px 18px", background: "#f8fafc", marginBottom: 24, textAlign: "left" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <span>🤖</span> AI Analysis
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                background: analysis.overall_status === "ok" ? "#f0fdf4" : analysis.overall_status === "critical" ? "#fef2f2" : "#FFFBEB",
                color: analysis.overall_status === "ok" ? "#16a34a" : analysis.overall_status === "critical" ? "#dc2626" : "#92400e",
                border: `1px solid ${analysis.overall_status === "ok" ? "#bbf7d0" : analysis.overall_status === "critical" ? "#fecaca" : "#FDE68A"}`,
                textTransform: "uppercase",
              }}>{analysis.overall_status}</span>
            </div>
            <div style={{ fontSize: 12, color: "#666" }}>Analyzed {analysis.analyzed_checks} checks with multimodal evidence</div>
          </div>
        )}

        {reportRows.length > 0 && (
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "16px 18px", background: "#fff", marginBottom: 24, textAlign: "left", maxHeight: 380, overflowY: "auto" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#111", marginBottom: 14 }}>Detailed Report</div>
            <div style={{ display: "grid", gap: 12 }}>
              {reportRows.map((row) => (
                <div key={row.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#fafafa" }}>
                  {(() => {
                    const ai = row.ai?.analysis;
                    const findings = Array.isArray(ai?.findings) ? ai.findings : [];
                    const visibleFindings = findings.filter((finding: any) =>
                      !isUnknownLike(finding?.component) &&
                      !isUnknownLike(finding?.issue) &&
                      !isUnknownLike(finding?.evidence) &&
                      !isUnknownLike(finding?.action),
                    );
                    const followUps = Array.isArray(ai?.follow_up_questions)
                      ? ai.follow_up_questions.filter((question: any) => typeof question === "string" && !isUnknownLike(question))
                      : [];

                    return (
                      <>
                  <div style={{ marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>{row.sectionTitle}</div>
                      <div style={{ fontSize: 13, color: "#111", fontWeight: 700 }}>{row.name}</div>
                    </div>
                  </div>

                  {row.remark && (
                    <div style={{ fontSize: 12, color: "#444", marginBottom: 8, lineHeight: 1.5 }}>
                      <strong>Comment:</strong> {row.remark}
                    </div>
                  )}

                  {row.photos.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 6 }}>Photos ({row.photos.length})</div>
                      <ReportPhotoStrip files={row.photos} />
                    </div>
                  )}

                        {ai?.summary && (
                          <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.5, marginBottom: 6 }}>
                            <strong>summary:</strong> {ai.summary}
                          </div>
                        )}

                        {ai?.status && (
                          <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.5 }}>
                            <strong>status:</strong> {ai.status}
                          </div>
                        )}

                        {typeof ai?.confidence === "number" && (
                          <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.5, marginBottom: 6 }}>
                            <strong>confidence:</strong> {ai.confidence.toFixed(2)}
                          </div>
                        )}

                        {visibleFindings.length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 6 }}>findings</div>
                            <div style={{ display: "grid", gap: 6 }}>
                              {visibleFindings.map((finding: any, findingIndex: number) => (
                                <div key={`${row.id}-finding-${findingIndex}`} style={{ fontSize: 12, color: "#334155", lineHeight: 1.5, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}>
                                  <div><strong>component:</strong> {finding.component}</div>
                                  <div><strong>issue:</strong> {finding.issue}</div>
                                  <div><strong>severity:</strong> {finding.severity}</div>
                                  <div><strong>evidence:</strong> {finding.evidence}</div>
                                  <div><strong>action:</strong> {finding.action}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {followUps.length > 0 && (
                          <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.5 }}>
                            <strong>follow_up_questions:</strong> {followUps.join(" | ")}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={onBack} style={{
          padding: "11px 36px", borderRadius: 10, background: "#2563eb", color: "#fff",
          border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer",
        }}>
          Back to Machines
        </button>
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
    </>
  );
}
