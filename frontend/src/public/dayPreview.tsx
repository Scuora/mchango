// #day-preview: a small control for reviewing the public pages at each point of
// the funeral days. It appears only when the address has #day-preview, stays for
// the rest of that tab's visit, and changes nothing for anyone else.

import { clsx } from "clsx";
import { useState, useSyncExternalStore } from "react";
import { PREVIEW_AT, type Phase } from "./memorialDay";

type Mode = Phase | "live";

const KEY = "day-preview";
const MODES: [Mode, string][] = [
  ["live", "Now"],
  ["eve", "Eve"],
  ["fri", "Fri"],
  ["vigil", "Vigil"],
  ["sat", "Sat"],
  ["burial", "Burial"],
  ["after", "After"],
];

function stored(): Mode | null {
  try {
    const value = sessionStorage.getItem(KEY);
    return MODES.some(([m]) => m === value) ? (value as Mode) : null;
  } catch {
    return null;
  }
}

function store(value: Mode | null) {
  try {
    if (value) sessionStorage.setItem(KEY, value);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Private windows may refuse storage; the preview then lasts until the next page load.
  }
}

let mode: Mode | null = stored();
const listeners = new Set<() => void>();

function set(next: Mode | null) {
  mode = next;
  store(next);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function enableFromHash() {
  if (window.location.hash === `#${KEY}` && mode === null) set("live");
}

if (typeof window !== "undefined") {
  enableFromHash();
  window.addEventListener("hashchange", enableFromHash);
}

/** The moment being previewed, or null for the real time. */
export function usePreviewTime(): number | null {
  const current = useSyncExternalStore(subscribe, () => mode);
  return current && current !== "live" ? PREVIEW_AT[current] : null;
}

export function DayPreview() {
  const current = useSyncExternalStore(subscribe, () => mode);
  // Collapsed on phones, where it would cover the buttons being reviewed.
  const [open, setOpen] = useState(() => window.innerWidth > 760);
  if (current === null) return null;
  const button = "min-h-9 cursor-pointer rounded-[10px] px-2.5 text-[12.5px] font-medium";
  return (
    <div
      role="group"
      aria-label="Preview by time"
      className="fixed top-[4.25rem] right-3 z-[60] md:top-auto md:bottom-3 flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center justify-end gap-0.5 rounded-[14px] bg-[#141210]/95 p-1 text-white shadow-[0_6px_20px_rgb(0_0_0/0.35)] md:bottom-3"
    >
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={clsx(button, "text-white/70")}>
        Preview
      </button>
      {open &&
        MODES.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={current === value} onClick={() => set(value)} className={clsx(button, current === value ? "bg-white text-[#111]" : "hover:bg-white/10")}>
            {label}
          </button>
        ))}
      {open && (
        <button type="button" onClick={() => set(null)} className={clsx(button, "text-white/70 hover:bg-white/10")}>
          Off
        </button>
      )}
    </div>
  );
}
