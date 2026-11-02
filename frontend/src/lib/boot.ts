// Controls the opening screen in index.html: the memorial portrait with its
// candle-light ring. It appears before any script runs; the app fills in the
// name when it knows it and fades the screen out once the page is ready.

import { useEffect } from "react";

const shownAt = performance.now();
let bootDone: () => void = () => undefined;
const doneSignal = new Promise<void>((resolve) => (bootDone = resolve));

/** Resolves when the opening screen starts to fade (at once if there is none). */
export function whenBootDone(): Promise<void> {
  return doneSignal;
}
let nameShownAt: number | null = null;
let timer: number | undefined;
let finished = false;

function screen(): HTMLElement | null {
  return document.getElementById("boot");
}

function leave() {
  const boot = screen();
  if (!boot || finished) {
    document.documentElement.classList.remove("booting");
    bootDone();
    return;
  }
  finished = true;
  window.clearTimeout(timer);
  boot.classList.add("is-leaving");
  document.documentElement.classList.remove("booting");
  bootDone();
  window.setTimeout(() => boot.remove(), 1000);
}

/** Shows the name, dates and tribute line under the portrait. */
export function showBootMemorial(name: string | null, dates: string | null, tribute: string | null = null): void {
  const boot = screen();
  if (!boot || finished || !name) return;
  const nameEl = document.getElementById("boot-name");
  const datesEl = document.getElementById("boot-dates");
  if (nameEl) nameEl.textContent = name;
  if (datesEl) datesEl.textContent = dates ?? "";
  const tributeEl = document.getElementById("boot-tribute");
  if (tributeEl) tributeEl.textContent = tribute ?? "";
  boot.classList.add("has-name");
  nameShownAt = performance.now();
}

interface DismissOptions {
  /** Keep the screen up at least this long after the page started loading. */
  minVisibleMs?: number;
  /** Keep the name visible at least this long once shown. */
  holdNameMs?: number;
}

/** Fades the opening screen out, after any minimum display time. */
export function dismissBoot({ minVisibleMs = 0, holdNameMs = 0 }: DismissOptions = {}): void {
  if (!screen() || finished) return;
  const now = performance.now();
  let wait = Math.max(0, minVisibleMs - (now - shownAt));
  if (nameShownAt !== null) wait = Math.max(wait, holdNameMs - (now - nameShownAt));
  window.clearTimeout(timer);
  timer = window.setTimeout(leave, wait);
}

/** Dismisses the opening screen once `ready` becomes true. */
export function useDismissBoot(ready: boolean, options?: DismissOptions): void {
  const min = options?.minVisibleMs;
  const hold = options?.holdNameMs;
  useEffect(() => {
    if (ready) dismissBoot({ minVisibleMs: min, holdNameMs: hold });
  }, [ready, min, hold]);
}

// Visitors can tap to continue, and the screen never outstays a slow load.
const boot = screen();
if (!boot) {
  document.documentElement.classList.remove("booting");
  bootDone();
} else {
  boot.addEventListener("click", leave);
  window.setTimeout(() => document.getElementById("boot-hint")?.removeAttribute("hidden"), 1800);
  window.setTimeout(leave, 12000);
}
