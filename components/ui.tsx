"use client";
import { ArrowUpRight, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center gap-[5px] rounded-full"
      style={{ width: size, height: size, background: "radial-gradient(circle at 50% 120%, var(--accent), var(--accent-2))" }}
    >
      <i className="block h-2 w-1.5 rounded-full bg-white" />
      <i className="block h-2 w-1.5 rounded-full bg-white" />
    </span>
  );
}

export function Arrow({ className = "" }: { className?: string }) {
  return (
    <span className={`arrow-btn ${className}`}>
      <ArrowUpRight size={15} strokeWidth={2.5} />
    </span>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange(v: boolean): void; label: string; disabled?: boolean }) {
  return (
    <label className={`inline-flex cursor-pointer select-none items-center gap-2 text-[13.5px] font-medium ${disabled ? "pointer-events-none opacity-45" : ""}`}>
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-[21px] w-9 rounded-full bg-line transition peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-accent after:absolute after:left-[3px] after:top-[3px] after:size-[15px] after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-[15px]" />
      {label}
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange(v: T): void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-card-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${value === o.value ? "accent-grad text-white" : "text-muted hover:text-fg"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Semicircle progress gauge with a hatched remaining track. */
export function Gauge({ value, label, sub }: { value: number; label: string; sub: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="relative mx-auto mt-1 w-full max-w-[240px]">
      <svg viewBox="0 0 200 110" className="block w-full overflow-visible" aria-hidden>
        <defs>
          <pattern id="gauge-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="7" height="7" fill="var(--card)" />
            <line x1="0" y1="0" x2="0" y2="7" stroke="var(--hatch)" strokeWidth="5" />
          </pattern>
        </defs>
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="url(#gauge-hatch)" strokeWidth="26" />
        <path
          d="M20 100 A80 80 0 0 1 180 100"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="26"
          pathLength={100}
          strokeDasharray={`${pct} 100`}
          style={{ transition: "stroke-dasharray .3s linear" }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col text-center">
        <strong className="text-[34px] leading-none tracking-tight">{label}</strong>
        <span className="text-[11.5px] text-muted">{sub}</span>
      </div>
    </div>
  );
}

export function useTheme(): [string, () => void] {
  const [theme, setTheme] = useState("light");
  useEffect(() => setTheme(document.documentElement.dataset.theme || "light"), []);
  const toggle = () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* storage unavailable */
    }
    setTheme(next);
  };
  return [theme, toggle];
}

export function ThemeButton() {
  const [theme, toggle] = useTheme();
  return (
    <button type="button" onClick={toggle} aria-label="Toggle dark mode" className="inline-flex size-10 items-center justify-center rounded-full border border-line bg-card">
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

export { fmtTime, initials, timeAgo } from "@/lib/format";
