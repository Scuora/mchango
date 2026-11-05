// Contribution and spending trends, drawn as plain SVG from the public page
// data, so the charts always agree with the published lists and totals.
// Colours: --color-data-in (gold) and --color-data-out (plum), validated for
// colour-vision deficiency; every value is also in the table view.

import { clsx } from "clsx";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CountUp } from "@/components/CountUp";
import { whenBootDone } from "@/lib/boot";
import { formatKesShort } from "@/lib/money";
import { formatShortDate, todayNairobi } from "@/lib/time";
import type { PublicPage } from "@/lib/types";
import { CardTitle, PageHeader, PublicCard, kes } from "./parts";
import { usePublicPage } from "./PublicLayout";
import { useLang, useTr } from "./i18n";

interface Bucket {
  /** First day of the bucket, YYYY-MM-DD. */
  key: string;
  in: number;
  out: number;
  cumIn: number;
  cumOut: number;
}

const DAY = 24 * 60 * 60 * 1000;
const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const toKey = (time: number) => new Date(time).toISOString().slice(0, 10);

/** Daily buckets (weekly, from Monday, when the fundraiser runs long). */
function buildBuckets(page: PublicPage): { buckets: Bucket[]; weekly: boolean } {
  const ins = page.contributions;
  const outs = [...page.spending, ...page.charges];
  const dates = [...ins, ...outs].map((e) => e.date).sort();
  const first = [page.fundraiser.start_date, dates[0]].filter(Boolean).sort()[0];
  if (!first) return { buckets: [], weekly: false };
  const last = [todayNairobi(), dates[dates.length - 1]].sort()[1];
  const days = Math.round((toTime(last) - toTime(first)) / DAY) + 1;
  const weekly = days > 45;
  const bucketOf = (date: string) => {
    if (!weekly) return date;
    const t = toTime(date);
    const weekday = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
    return toKey(t - weekday * DAY);
  };
  const buckets = new Map<string, Bucket>();
  for (let t = toTime(bucketOf(first)); t <= toTime(last); t += (weekly ? 7 : 1) * DAY) {
    buckets.set(toKey(t), { key: toKey(t), in: 0, out: 0, cumIn: 0, cumOut: 0 });
  }
  for (const e of ins) {
    const b = buckets.get(bucketOf(e.date));
    if (b) b.in += e.amount_minor ?? 0;
  }
  for (const e of outs) {
    const b = buckets.get(bucketOf(e.date));
    if (b) b.out += e.amount_minor ?? 0;
  }
  let cumIn = 0;
  let cumOut = 0;
  const list = [...buckets.values()];
  for (const b of list) {
    cumIn += b.in;
    cumOut += b.out;
    b.cumIn = cumIn;
    b.cumOut = cumOut;
  }
  return { buckets: list, weekly };
}

/** A round axis in whole shillings: steps of 1, 2 or 5 × 10ⁿ, never fractions of a shilling. */
function niceScale(maxMinor: number): { top: number; ticks: number[] } {
  const maxShillings = Math.max(1, maxMinor / 100);
  const rough = maxShillings / 3;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power);
  const top = Math.ceil(maxShillings / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v * 100);
  return { top: top * 100, ticks };
}

/** Axis labels in shillings: 0 / 500 / 10K / 1.5M. */
function compact(minor: number): string {
  const shillings = minor / 100;
  if (shillings >= 1_000_000) return `${+(shillings / 1_000_000).toFixed(1)}M`;
  if (shillings >= 10_000) return `${Math.round(shillings / 1_000)}K`;
  if (shillings >= 1_000) return `${+(shillings / 1_000).toFixed(1)}K`;
  return shillings.toLocaleString("en-GB");
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** True once the opening screen has gone and the chart is on screen, so its drawing is seen. */
function useSeen(ref: React.RefObject<HTMLElement | null>): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let observer: IntersectionObserver | null = null;
    let cancelled = false;
    void whenBootDone().then(() => {
      if (cancelled) return;
      if (!("IntersectionObserver" in window)) return setSeen(true);
      observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting) return;
          setSeen(true);
          observer?.disconnect();
        },
        { threshold: 0.3 },
      );
      observer.observe(node);
    });
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [ref]);
  return seen;
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function bucketLabel(b: Bucket, weekly: boolean, sw = false): string {
  return weekly ? `${sw ? "Wiki ya" : "Week of"} ${formatShortDate(b.key)}` : formatShortDate(b.key);
}

const IN = "var(--color-data-in)";
const OUT = "var(--color-data-out)";
const HEIGHT = 300;
const M = { top: 40, right: 20, bottom: 40, left: 54 };
/** How long a line takes to draw; matches the curve-* animations in index.css. */
const DRAW_MS = 1700;

type View = "running" | "daily";

interface Series {
  key: "in" | "out";
  label: string;
  color: string;
  hex: string;
  value: (b: Bucket) => number;
}

/** A smooth curve through the points that never overshoots them (monotone cubic, starting flat). */
function smoothPath(points: [number, number][]): string {
  const n = points.length;
  if (n === 0) return "";
  let d = `M${points[0][0]},${points[0][1]}`;
  const slope = points.slice(1).map((p, i) => (p[1] - points[i][1]) / (p[0] - points[i][0] || 1));
  const tangent = points.map((_, i) => {
    if (i === 0) return 0;
    if (i === n - 1) return n === 2 ? 0 : slope[i - 1];
    const [a, b] = [slope[i - 1], slope[i]];
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  });
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const h = (x1 - x0) / 3;
    d += `C${x0 + h},${y0 + tangent[i] * h} ${x1 - h},${y1 - tangent[i + 1] * h} ${x1},${y1}`;
  }
  return d;
}

const bezier = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;

/** The draw easing, cubic-bezier(0.65, 0, 0.35, 1): share of the line drawn at a share of the time. */
function drawEase(time: number): number {
  let [lo, hi] = [0, 1];
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (bezier(0.65, 0.35, mid) < time) lo = mid;
    else hi = mid;
  }
  return bezier(0, 1, (lo + hi) / 2);
}

/** The inverse: when, as a share of the draw, the tip of a line passes a share of its length. */
function drawTime(share: number): number {
  for (let t = 0; t <= 1; t += 0.01) if (bezier(0, 1, t) >= share) return bezier(0.65, 0.35, t);
  return 1;
}

/** Share of the line's length up to each point, from the straight segments between them. */
function lengthShares(points: [number, number][]): number[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const total = lengths[lengths.length - 1] || 1;
  return lengths.map((l) => l / total);
}

interface Pill {
  key: string;
  x: number;
  y: number;
  text: string;
  color: string;
  filled: boolean;
  align: "center" | "end";
}

/** Places value pills above their points, nudging upwards so they never overlap. */
function placePills(pills: Pill[], width: number): (Pill & { cy: number; left: number; w: number })[] {
  const placed: (Pill & { cy: number; left: number; w: number })[] = [];
  for (const pill of [...pills].sort((a, b) => b.y - a.y)) {
    const w = pill.text.length * 7.3 + 22;
    const left = Math.min(Math.max(pill.align === "end" ? pill.x + 10 - w : pill.x - w / 2, M.left), width - w - 2);
    const clash = placed.find((p) => Math.abs(p.left + p.w / 2 - (left + w / 2)) < (p.w + w) / 2);
    const cy = Math.max(12, Math.min(pill.y - 22, clash ? clash.cy - 28 : Infinity));
    placed.push({ ...pill, cy, left, w });
  }
  return placed;
}

/** The glowing spark that rides the tip of a line as it draws, following the line's own animation. */
function Spark({ line: lineKey, path, color, delay }: { line: string; path: string; color: string; delay: number }) {
  const track = useRef<SVGPathElement>(null);
  const spark = useRef<SVGGElement>(null);
  useLayoutEffect(() => {
    const line = track.current;
    const node = spark.current;
    if (!line || !node) return;
    const total = line.getTotalLength();
    const place = (share: number) => {
      const point = line.getPointAtLength(share * total);
      node.setAttribute("transform", `translate(${point.x},${point.y})`);
    };
    const drawn = node.ownerSVGElement?.querySelector(`[data-line="${lineKey}"]`);
    const animation = drawn && "getAnimations" in drawn ? drawn.getAnimations()[0] : undefined;
    let start = -1;
    let frame = 0;
    const step = (now: number) => {
      let t: number;
      if (animation) {
        if (animation.playState === "idle") return;
        t = animation.playState === "finished" ? 1 : (animation.effect?.getComputedTiming().progress ?? 0);
      } else {
        if (start < 0) start = now + delay;
        t = Math.min(1, Math.max(0, (now - start) / DRAW_MS));
      }
      place(drawEase(t));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    place(0);
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [lineKey, path, delay]);
  return (
    <g aria-hidden className="pointer-events-none">
      <path ref={track} d={path} fill="none" />
      <g ref={spark} className="spark" style={{ "--d": `${delay}ms` } as React.CSSProperties}>
        <circle r={12} fill={color} opacity={0.2} />
        <circle r={6} fill={color} opacity={0.45} />
        <circle r={3} fill="#fff" />
      </g>
    </g>
  );
}

function CurveChart({ buckets, weekly, showIn, view }: { buckets: Bucket[]; weekly: boolean; showIn: boolean; view: View }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const tr = useTr();
  const sw = useLang() === "sw";
  const [ref, width] = useWidth<HTMLDivElement>();
  const seen = useSeen(ref);
  const [active, setActive] = useState<number | null>(null);
  const [motion] = useState(() => !reducedMotion());
  const running = view === "running";
  const series: Series[] = [
    ...(showIn ? [{ key: "in" as const, label: tr("Received", "Zilizopokelewa"), color: IN, hex: "#b8862a", value: (b: Bucket) => (running ? b.cumIn : b.in) }] : []),
    { key: "out", label: tr("Spent", "Zilizotumika"), color: OUT, hex: "#6f4c94", value: (b: Bucket) => (running ? b.cumOut : b.out) },
  ];

  // Position 0 is the opening, before anything came in; position i is the end of bucket i - 1.
  const n = buckets.length;
  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = HEIGHT - M.top - M.bottom;
  const base = M.top + plotH;
  const { top, ticks } = niceScale(Math.max(0, ...buckets.flatMap((b) => series.map((s) => s.value(b)))) * 1.12);
  const x = (p: number) => M.left + (n ? (p / n) * plotW : 0);
  const y = (v: number) => base - (v / top) * plotH;
  const lines = series.map((s) => {
    const points: [number, number][] = [[x(0), base], ...buckets.map((b, i) => [x(i + 1), y(s.value(b))] as [number, number])];
    const line = smoothPath(points);
    return { ...s, points, line, shares: lengthShares(points), area: `${line}L${x(n)},${base}L${x(0)},${base}Z` };
  });

  const pills = placePills(
    lines.flatMap((l): Pill[] => {
      if (running) {
        const last = buckets[n - 1];
        return [{ key: l.key, x: x(n), y: y(l.value(last)), text: kes(l.value(last)), color: l.color, filled: true, align: "end" }];
      }
      const values = buckets.map(l.value);
      const peak = Math.max(...values);
      if (peak <= 0) return [];
      const p = values.indexOf(peak) + 1;
      return [{ key: l.key, x: x(p), y: y(peak), text: kes(peak), color: l.color, filled: false, align: "center" }];
    }),
    width,
  );

  const xLabels = [0];
  for (let p = 1; p <= n; p++) {
    if (x(p) - x(xLabels[xLabels.length - 1]) >= 68) xLabels.push(p);
    else if (p === n) xLabels[xLabels.length - 1] = n;
  }

  function pick(clientX: number, box: DOMRect) {
    const ratio = (clientX - box.left) / box.width;
    setActive(Math.max(1, Math.min(n, Math.round(ratio * n))));
  }

  function onKey(event: React.KeyboardEvent) {
    if (event.key === "ArrowRight") setActive((a) => Math.min(n, (a ?? 0) + 1));
    else if (event.key === "ArrowLeft") setActive((a) => Math.max(1, (a ?? n + 1) - 1));
    else if (event.key === "Escape") setActive(null);
    else return;
    event.preventDefault();
  }

  const at = active !== null ? buckets[active - 1] : null;
  const flip = active !== null && x(active) > width / 2;
  const delay = (ms: number) => ({ "--d": `${Math.round(ms)}ms` }) as React.CSSProperties;

  return (
    <div
      ref={ref}
      className="relative rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-plum-600"
      tabIndex={0}
      aria-label={tr(
        `${running ? "Running totals" : weekly ? "Week by week" : "Day by day"}. Use the arrow keys to move through the ${weekly ? "weeks" : "days"}.`,
        `${running ? "Jumla inayoongezeka" : weekly ? "Wiki kwa wiki" : "Siku kwa siku"}. Tumia vitufe vya mishale kupitia ${weekly ? "wiki" : "siku"}.`,
      )}
      onKeyDown={onKey}
      onFocus={() => setActive((a) => a ?? n)}
      onBlur={() => setActive(null)}
    >
      {!(seen && width > 0) ? (
        <div style={{ height: HEIGHT }} />
      ) : (
        <svg width={width} height={HEIGHT} role="img" aria-label={tr("Money received and spent over time; the figures are in the table below.", "Pesa zilizopokelewa na kutumika kwa muda; takwimu ziko kwenye jedwali hapa chini.")} className="block overflow-visible">
          <defs>
            {lines.map((l) => (
              <linearGradient key={l.key} id={`${id}-${l.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={l.hex} stopOpacity={l.key === "in" ? 0.3 : 0.24} />
                <stop offset="70%" stopColor={l.hex} stopOpacity={0.05} />
                <stop offset="100%" stopColor={l.hex} stopOpacity={0} />
              </linearGradient>
            ))}
            <linearGradient id={`${id}-guide`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#84699a" stopOpacity={0} />
              <stop offset="35%" stopColor="#84699a" stopOpacity={0.7} />
              <stop offset="100%" stopColor="#84699a" stopOpacity={0.9} />
            </linearGradient>
            <filter id={`${id}-glow`} x="-20%" y="-50%" width="140%" height="200%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
            <filter id={`${id}-lift`} x="-30%" y="-60%" width="160%" height="260%">
              <feDropShadow dx="0" dy="3" stdDeviation="3.5" floodColor="#1f1d1b" floodOpacity="0.16" />
            </filter>
          </defs>

          {/* Grid: dashed and recessive, drawn in from the left. */}
          <text x={M.left - 12} y={M.top - 18} textAnchor="end" className="fade-label fill-stone-400 text-[11px] font-semibold tracking-[0.12em]" style={delay(0)}>
            KES
          </text>
          {ticks.map((t, i) => (
            <g key={t}>
              <line
                className="grid-in"
                style={delay(i * 70)}
                x1={M.left}
                x2={width - M.right}
                y1={y(t)}
                y2={y(t)}
                stroke={t === 0 ? "#d6d3d1" : "#e7e5e4"}
                strokeDasharray={t === 0 ? undefined : "3 6"}
              />
              <text x={M.left - 12} y={y(t)} dy="0.32em" textAnchor="end" className="fade-label fill-stone-500 text-[12px] tabular-nums" style={delay(120 + i * 70)}>
                {compact(t)}
              </text>
            </g>
          ))}

          {/* Fills sweep in behind the lines; received is drawn last so it sits on top. */}
          {[...lines].reverse().map((l, i) => (
            <g key={l.key} style={{ "--d": `${i * 220}ms` } as React.CSSProperties}>
              <path className="curve-wipe" d={l.area} fill={`url(#${id}-${l.key})`} />
              <path className="curve-draw" pathLength={1} d={l.line} fill="none" stroke={l.color} strokeWidth={7} strokeOpacity={0.28} filter={`url(#${id}-glow)`} />
              <path data-line={l.key} className="curve-draw" pathLength={1} d={l.line} fill="none" stroke={l.color} strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          ))}

          {/* Points appear as the tip of the line reaches them. */}
          {[...lines].reverse().map((l, i) =>
              l.points.slice(1).map(([px, py], p) =>
                p + 1 !== n && (plotW / n < 16 || l.value(buckets[p]) === 0) ? null : (
                <circle
                  key={`${l.key}-${p}`}
                  className="dot-pop"
                  style={delay(i * 220 + drawTime(l.shares[p + 1]) * DRAW_MS - 40)}
                  cx={px}
                  cy={py}
                  r={active === p + 1 ? 0 : 3.75}
                  fill="#fff"
                  stroke={l.color}
                  strokeWidth={2.25}
                />
                ),
              ),
            )}

          {/* The latest figure keeps a slow, candle-like pulse. */}
          {motion &&
            lines.map((l, i) => {
              const [px, py] = l.points[n];
              return <circle key={l.key} className="halo" style={delay(DRAW_MS + 300 + i * 700)} cx={px} cy={py} r={6} fill={l.color} />;
            })}
          {motion && [...lines].reverse().map((l, i) => <Spark key={l.key} line={l.key} path={l.line} color={l.color} delay={i * 220} />)}

          {/* Value pills: end totals, or the highest day. */}
          {active === null &&
            pills.map((pill, i) => (
              <g key={pill.key} className="badge-in" style={delay(DRAW_MS - 100 + i * 140)} filter={`url(#${id}-lift)`}>
                <rect x={pill.left} y={pill.cy - 12} width={pill.w} height={24} rx={12} fill={pill.filled ? pill.color : "#fff"} stroke={pill.filled ? "none" : pill.color} strokeWidth={1.5} />
                <text x={pill.left + pill.w / 2} y={pill.cy} dy="0.35em" textAnchor="middle" className={clsx("text-[12.5px] font-semibold tabular-nums", pill.filled ? "fill-white" : "fill-stone-800")}>
                  {pill.text}
                </text>
              </g>
            ))}

          {/* X labels, with "Opened" at the start of the line. */}
          {xLabels.map((p) => (
            <text
              key={p}
              x={x(p)}
              y={HEIGHT - 12}
              textAnchor={p === 0 ? "start" : p === n ? "end" : "middle"}
              className={clsx("fade-label text-[12px]", p === 0 ? "fill-stone-400 italic" : "fill-stone-500", active !== null && "opacity-30 transition-opacity")}
              style={delay(300 + (p / Math.max(1, n)) * 600)}
            >
              {p === 0 ? tr("Opened", "Mwanzo") : formatShortDate(buckets[p - 1].key)}
            </text>
          ))}

          {/* Hover: a guide, ringed points and a date chip. */}
          {active !== null && at && (
            <g className="pointer-events-none">
              <line x1={x(active)} x2={x(active)} y1={M.top - 8} y2={base} stroke={`url(#${id}-guide)`} strokeWidth={1.5} strokeDasharray="4 4" />
              {lines.map((l) => (
                <g key={l.key}>
                  <circle cx={x(active)} cy={y(l.value(at))} r={13} fill={l.color} opacity={0.16} className="dot-pop" />
                  <circle cx={x(active)} cy={y(l.value(at))} r={6} fill={l.color} stroke="#fff" strokeWidth={3} />
                </g>
              ))}
              {(() => {
                const text = formatShortDate(at.key);
                const w = text.length * 7.4 + 22;
                const cx = Math.min(Math.max(x(active), M.left + w / 2), width - M.right - w / 2 + 10);
                return (
                  <g>
                    <rect x={cx - w / 2} y={HEIGHT - 26} width={w} height={22} rx={11} fill="#3c2e49" />
                    <text x={cx} y={HEIGHT - 15} dy="0.35em" textAnchor="middle" className="fill-white text-[12px] font-semibold">
                      {text}
                    </text>
                  </g>
                );
              })()}
            </g>
          )}

          <rect
            x={M.left}
            y={M.top - 12}
            width={plotW}
            height={plotH + M.bottom + 12}
            fill="transparent"
            className="cursor-crosshair"
            style={{ touchAction: "pan-y" }}
            onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerLeave={() => setActive(null)}
          />
        </svg>
      )}

      {active !== null && at && (
        <div
          className="tip-in pointer-events-none absolute z-10 w-56 rounded-2xl border border-white/60 bg-white/85 px-4 py-3 text-[14px] shadow-[0_18px_40px_-18px_rgb(46_35_56/0.45)] ring-1 ring-stone-900/5 backdrop-blur-md transition-[left,transform] duration-200 ease-out"
          style={{ left: x(active), top: M.top - 6, transform: flip ? "translateX(calc(-100% - 18px))" : "translateX(18px)" }}
          role="status"
        >
          <p className="mb-1.5 text-[12px] font-semibold tracking-[0.12em] text-stone-500 uppercase">
            {running ? tr(`Up to ${bucketLabel(at, weekly).replace(/^W/, "w")}`, `Hadi ${bucketLabel(at, weekly, true).replace(/^W/, "w")}`) : bucketLabel(at, weekly, sw)}
          </p>
          {lines.map((l) => (
            <div key={l.key} className="flex items-baseline justify-between gap-3 py-0.5">
              <span className="flex items-center gap-2 text-stone-600">
                <span className="size-2.5 translate-y-[-1px] rounded-full" style={{ background: l.color }} aria-hidden />
                {l.label}
              </span>
              <span className="text-right">
                <span className="font-semibold text-stone-900 tabular-nums">{kes(l.value(at))}</span>
                {running && (
                  <span className="block text-[12px] text-stone-500 tabular-nums">+{kes(l.key === "in" ? at.in : at.out)} {weekly ? tr("that week", "wiki hiyo") : tr("that day", "siku hiyo")}</span>
                )}
              </span>
            </div>
          ))}
          {running && showIn && (
            <p className="mt-1.5 flex justify-between border-t border-stone-200/70 pt-1.5 text-[13px] text-stone-600">
              {tr("Not yet spent", "Bado hazijatumika")} <span className="font-semibold text-stone-900 tabular-nums">{kes(at.cumIn - at.cumOut)}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** One card for both views, switched with a sliding segmented control. */
function TrendsCard({ buckets, weekly, showIn }: { buckets: Bucket[]; weekly: boolean; showIn: boolean }) {
  const tr = useTr();
  const [view, setView] = useState<View>("running");
  const received = buckets.reduce((sum, b) => sum + b.in, 0);
  const spent = buckets.reduce((sum, b) => sum + b.out, 0);
  const views = [
    ["running", tr("Running total", "Jumla")],
    ["daily", weekly ? tr("Week by week", "Wiki kwa wiki") : tr("Day by day", "Siku kwa siku")],
  ] as const;
  return (
    <PublicCard className="relative overflow-hidden">
      <div aria-hidden className="card-glow pointer-events-none absolute -top-28 -right-20 size-72 rounded-full bg-ochre-200/45 blur-3xl" />
      <div aria-hidden className="card-glow pointer-events-none absolute -bottom-32 -left-24 size-72 rounded-full bg-plum-200/35 blur-3xl [animation-delay:-3s]" />
      <div className="relative flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <CardTitle eyebrow={tr(`Since ${formatShortDate(buckets[0].key)}`, `Tangu ${formatShortDate(buckets[0].key)}`)}>
          {tr("Money in and out", "Pesa zilizoingia na kutoka")}
        </CardTitle>
        <div role="tablist" aria-label={tr("Chart view", "Mwonekano wa chati")} className="relative grid grid-cols-2 rounded-full bg-stone-100/90 p-1 text-[14px] ring-1 ring-stone-200/70">
          <span
            aria-hidden
            className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-white shadow-[0_2px_10px_-3px_rgb(46_35_56/0.3)] transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
            style={{ transform: view === "running" ? "translateX(0)" : "translateX(100%)" }}
          />
          {views.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={view === value}
              onClick={() => setView(value)}
              className={clsx(
                "press relative z-10 min-h-9 cursor-pointer rounded-full px-4 font-semibold whitespace-nowrap transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-plum-600",
                view === value ? "text-plum-800" : "text-stone-500 hover:text-stone-800",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <dl className="relative mt-1 flex flex-wrap gap-2.5">
        {showIn && (
          <div className="stat-chip">
            <dt className="flex items-center gap-2 text-stone-600">
              <span className="size-2.5 rounded-full" style={{ background: IN }} aria-hidden />
              {tr("Received", "Zilizopokelewa")}
            </dt>
            <dd className="font-semibold text-stone-900 tabular-nums">
              <CountUp value={received} format={kes} />
            </dd>
          </div>
        )}
        <div className="stat-chip">
          <dt className="flex items-center gap-2 text-stone-600">
            <span className="size-2.5 rounded-full" style={{ background: OUT }} aria-hidden />
            {tr("Spent", "Zilizotumika")}
          </dt>
          <dd className="font-semibold text-stone-900 tabular-nums">
            <CountUp value={spent} format={kes} />
          </dd>
        </div>
        {showIn && (
          <div className="stat-chip">
            <dt className="text-stone-600">{tr("Not yet spent", "Bado hazijatumika")}</dt>
            <dd className="font-semibold text-stone-900 tabular-nums">
              <CountUp value={received - spent} format={kes} />
            </dd>
          </div>
        )}
      </dl>

      <div key={view} className="page-enter relative mt-5 -mx-1">
        <CurveChart buckets={buckets} weekly={weekly} showIn={showIn} view={view} />
      </div>
      <p className="relative mt-2 text-[14px] text-stone-500">
        {view === "running"
          ? showIn
            ? tr("The space between the gold and plum lines is money received but not yet spent.", "Nafasi kati ya mstari wa dhahabu na wa zambarau ni pesa zilizopokelewa ambazo bado hazijatumika.")
            : tr("Spending added up over time.", "Matumizi yakijumlishwa kwa muda.")
          : tr(
              `What came in and went out each ${weekly ? "week" : "day"}. Hover, tap or use the arrow keys for the figures.`,
              `Kilichoingia na kutoka kila ${weekly ? "wiki" : "siku"}. Gusa, elekeza au tumia vitufe vya mishale kuona takwimu.`,
            )}
      </p>
    </PublicCard>
  );
}

function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div data-reveal className="rounded-2xl border border-stone-200 bg-white p-4">
      <p className="text-[15px] text-stone-600">{label}</p>
      <p className="mt-1 text-[1.6rem] leading-tight font-semibold text-stone-900">{value}</p>
      {note && <p className="mt-0.5 text-[14px] text-stone-500">{note}</p>}
    </div>
  );
}

export function TrendsPage() {
  const page = usePublicPage();
  const { buckets, weekly } = useMemo(() => buildBuckets(page), [page]);
  const t = page.totals;
  const showIn = page.fundraiser.show_contribution_amounts;
  const spent = t.expenses_minor + t.charges_minor;
  const hasData = buckets.some((b) => b.in > 0 || b.out > 0);
  const tr = useTr();
  return (
    <>
      <PageHeader title={tr("Trends", "Mwenendo")}>
        {tr(
          `How contributions and spending have moved ${weekly ? "week by week" : "day by day"}.`,
          `Jinsi michango na matumizi yalivyokwenda ${weekly ? "wiki kwa wiki" : "siku kwa siku"}.`,
        )}
      </PageHeader>
      <div className="mx-auto max-w-4xl space-y-4 px-4 pt-4 md:px-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile
            label={tr("Received", "Zilizopokelewa")}
            value={kes(t.contributions_minor)}
            note={tr(
              `${t.contributions_count} contribution${t.contributions_count === 1 ? "" : "s"}`,
              t.contributions_count === 1 ? "mchango 1" : `michango ${t.contributions_count}`,
            )}
          />
          <StatTile
            label={tr("Spent", "Zilizotumika")}
            value={kes(spent)}
            note={t.charges_minor > 0 ? tr(`incl. ${kes(t.charges_minor)} transaction costs`, `pamoja na gharama za miamala ${kes(t.charges_minor)}`) : undefined}
          />
          <StatTile label={tr("Remaining", "Iliyobaki")} value={kes(t.remaining_minor)} />
          <StatTile
            label={weekly ? tr("Largest week", "Wiki kubwa zaidi") : tr("Largest day", "Siku kubwa zaidi")}
            value={hasData ? kes(Math.max(...buckets.map((b) => b.in))) : "—"}
            note={tr("received", "zilizopokelewa")}
          />
        </div>

        {!hasData ? (
          <PublicCard>
            <p className="text-stone-700">
              {tr("The charts will appear once the first contribution or expense is recorded.", "Chati zitaonekana mchango au matumizi ya kwanza yakisharekodiwa.")}
            </p>
          </PublicCard>
        ) : (
          <>
            {!showIn && (
              <p className="rounded-xl bg-stone-100 px-4 py-3 text-[15px] text-stone-700">
                {tr(
                  "The family has chosen not to show individual amounts, so the charts show spending only.",
                  "Familia imeamua kutoonyesha kiasi cha kila mchango, kwa hivyo chati zinaonyesha matumizi pekee.",
                )}
              </p>
            )}
            <TrendsCard buckets={buckets} weekly={weekly} showIn={showIn} />
            <details className="rounded-2xl border border-stone-200 bg-white p-5">
              <summary className="cursor-pointer font-semibold text-stone-900">{tr("Show the figures as a table", "Onyesha takwimu kama jedwali")}</summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-[15px]">
                  <thead className="text-stone-500">
                    <tr>
                      <th className="py-2 pr-4 font-medium">{weekly ? tr("Week of", "Wiki ya") : tr("Day", "Siku")}</th>
                      {showIn && <th className="py-2 pr-4 text-right font-medium">{tr("Received", "Zilizopokelewa")}</th>}
                      <th className="py-2 pr-4 text-right font-medium">{tr("Spent", "Zilizotumika")}</th>
                      {showIn && <th className="py-2 text-right font-medium">{tr("Received less spent", "Baki")}</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 tabular-nums">
                    {buckets.map((b) => (
                      <tr key={b.key}>
                        <td className="py-2 pr-4">{formatShortDate(b.key)}</td>
                        {showIn && <td className="py-2 pr-4 text-right">{formatKesShort(b.in)}</td>}
                        <td className="py-2 pr-4 text-right">{formatKesShort(b.out)}</td>
                        {showIn && <td className="py-2 text-right">{formatKesShort(b.cumIn - b.cumOut)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </div>
    </>
  );
}
