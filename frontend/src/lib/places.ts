// Where you were on each management page, for this browser tab: a list page's
// filters (its URL query) and how far down each page was scrolled. Coming back to
// a page, by the browser's Back button, a "← All …" link or the menu, puts both
// back. Kept in sessionStorage, so a reload keeps it and a new tab starts clean.

import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useLocation, useNavigationType, useSearchParams } from "react-router";

const KEY = "mchango.places";
/** Pages whose filters are remembered. Forms (Add, Reports, Settings…) always start clean. */
const LISTS = new Set([
  "/manage",
  "/manage/transactions",
  "/manage/accounts",
  "/manage/pledges",
  "/manage/bills",
  "/manage/challenges",
  "/manage/statements",
  "/manage/activity",
]);
const MAX_SCROLLS = 60;

interface Places {
  /** pathname → the query it last had, e.g. "?kind=expense&sort=amount_desc". */
  search: Record<string, string>;
  /** pathname + query → how far down it was scrolled. */
  scroll: Record<string, number>;
  /** The address shown before the current one. */
  previous: string | null;
}

let places: Places = load();

function load(): Places {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Partial<Places> | null;
    if (saved && typeof saved === "object") return { search: saved.search ?? {}, scroll: saved.scroll ?? {}, previous: saved.previous ?? null };
  } catch {
    // Storage blocked or corrupt: start clean.
  }
  return { search: {}, scroll: {}, previous: null };
}

function persist() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(places));
  } catch {
    // Storage full or blocked: memory still works for this visit.
  }
}

export function isListPage(pathname: string): boolean {
  return LISTS.has(pathname);
}

/** A page's address with the filters it last had. */
export function lastUrl(pathname: string): string {
  return pathname + (isListPage(pathname) ? (places.search[pathname] ?? "") : "");
}

/** The address shown before the current one, if any. */
export function previousUrl(): string | null {
  return places.previous;
}

function rememberScroll(url: string, y: number) {
  delete places.scroll[url];
  places.scroll[url] = Math.round(y);
  const urls = Object.keys(places.scroll);
  for (const old of urls.slice(0, Math.max(0, urls.length - MAX_SCROLLS))) delete places.scroll[old];
  persist();
}

/**
 * Scrolls `el` to `target` once the page is tall enough (its data loads after it
 * appears), giving up after a few seconds or as soon as the person scrolls.
 */
function scrollWhenReady(el: HTMLElement, target: number): () => void {
  let done = false;
  const content = el.firstElementChild ?? el;
  const stop = () => {
    if (done) return;
    done = true;
    observer.disconnect();
    window.clearTimeout(timer);
    el.removeEventListener("wheel", stop);
    el.removeEventListener("touchstart", stop);
    window.removeEventListener("keydown", stop);
  };
  const attempt = () => {
    if (done) return;
    const max = el.scrollHeight - el.clientHeight;
    el.scrollTop = Math.min(target, Math.max(0, max));
    if (max >= target) stop();
  };
  const observer = new ResizeObserver(attempt);
  observer.observe(content);
  const timer = window.setTimeout(stop, 5000);
  el.addEventListener("wheel", stop, { passive: true });
  el.addEventListener("touchstart", stop, { passive: true });
  window.addEventListener("keydown", stop);
  attempt();
  return stop;
}

/**
 * Remembers filters and scroll for the scrolling area `main`, and puts them back:
 * on Back/Forward, and when a list page is opened again (menu or "← All" link).
 * Anything else opens at the top; a filter change on the same page stays put.
 */
export function usePlaceMemory(main: RefObject<HTMLElement | null>) {
  const location = useLocation();
  const type = useNavigationType();
  const url = location.pathname + location.search;
  const shown = useRef({ url, pathname: location.pathname });
  const y = useRef(0);

  useEffect(() => {
    const el = main.current;
    if (!el) return;
    const onScroll = () => {
      y.current = el.scrollTop;
    };
    const onHide = () => rememberScroll(shown.current.url, y.current);
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onHide);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onHide);
    };
  }, [main]);

  useLayoutEffect(() => {
    const el = main.current;
    if (!el) return;
    const before = shown.current;
    // The page already shown, opened again: nothing to restore.
    if (before.url === url && type !== "POP") return;
    if (before.url !== url) {
      rememberScroll(before.url, y.current);
      places.previous = before.url;
    }
    shown.current = { url, pathname: location.pathname };
    if (isListPage(location.pathname)) places.search[location.pathname] = location.search;
    persist();

    // Filters changed in place: stay where you are.
    if (type === "REPLACE" && before.pathname === location.pathname) return;
    const saved = places.scroll[url];
    const returning = type === "POP" || isListPage(location.pathname);
    if (returning && saved) return scrollWhenReady(el, saved);
    el.scrollTop = 0;
    y.current = 0;
  }, [main, url, location.pathname, location.search, type]);
}

/**
 * A filter kept in the page's address (`?key=value`), so Back, a reload or a
 * shared link shows the page as it was. The default value is left out of the URL.
 */
export function useUrlState<T extends string>(key: string, fallback: T, allowed?: readonly T[]): [T, (next: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const value = (raw !== null && (!allowed || allowed.includes(raw as T)) ? raw : fallback) as T;
  const set = useCallback(
    (next: T) => {
      setParams(
        (current) => {
          const updated = new URLSearchParams(current);
          if (next === fallback || next === "") updated.delete(key);
          else updated.set(key, next);
          return updated;
        },
        { replace: true },
      );
    },
    [key, fallback, setParams],
  );
  return [value, set];
}
