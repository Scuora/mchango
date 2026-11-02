// Reveals [data-reveal] elements as they scroll into view, including ones
// added later. Starts once the opening screen has gone, so the first cards
// animate in view rather than behind it.

import { useEffect } from "react";
import { whenBootDone } from "./boot";

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function useReveal(): void {
  useEffect(() => {
    let intersection: IntersectionObserver | null = null;
    let mutation: MutationObserver | null = null;
    let cancelled = false;
    const show = (el: Element) => el.classList.add("is-revealed");

    void whenBootDone().then(() => {
      if (cancelled) return;
      const pending = () => document.querySelectorAll("[data-reveal]:not(.is-revealed)");
      if (reduced() || !("IntersectionObserver" in window)) {
        pending().forEach(show);
        mutation = new MutationObserver(() => pending().forEach(show));
        mutation.observe(document.body, { childList: true, subtree: true });
        return;
      }
      intersection = new IntersectionObserver(
        (entries) => {
          let order = 0;
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            (entry.target as HTMLElement).style.setProperty("--reveal-delay", `${Math.min(order++, 5) * 90}ms`);
            show(entry.target);
            intersection?.unobserve(entry.target);
          }
        },
        { rootMargin: "0px 0px -6% 0px", threshold: 0.06 },
      );
      const watch = () => pending().forEach((el) => intersection?.observe(el));
      watch();
      mutation = new MutationObserver(watch);
      mutation.observe(document.body, { childList: true, subtree: true });
    });
    return () => {
      cancelled = true;
      intersection?.disconnect();
      mutation?.disconnect();
    };
  }, []);
}

/** Counts up to `target` once the opening screen has gone. */
export function countUp(target: number, onFrame: (value: number) => void, duration = 1400): () => void {
  let frame = 0;
  let stopped = false;
  void whenBootDone().then(() => {
    if (stopped) return;
    if (reduced() || target === 0) {
      onFrame(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      onFrame(t === 1 ? target : Math.round((target * eased) / 100) * 100);
      if (t < 1 && !stopped) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  });
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
  };
}
