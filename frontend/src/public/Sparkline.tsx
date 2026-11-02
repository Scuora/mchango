// A small gold line, drawn in like the Trends charts, for a glance at how
// giving has moved without opening the full charts.

import { useId, type CSSProperties } from "react";
import type { PublicEntry } from "@/lib/types";

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 864e5).toISOString().slice(0, 10);

/**
 * One value per Nairobi day from `from` to `to`: the day's total (or count,
 * when amounts are hidden), or the running total when `running` is set.
 */
export function dailySeries(entries: PublicEntry[], from: string, to: string, { running = false } = {}): number[] {
  const byDay = new Map<string, number>();
  const hidden = entries.some((e) => e.amount_minor === null);
  for (const e of entries) byDay.set(e.date, (byDay.get(e.date) ?? 0) + (hidden ? 1 : (e.amount_minor ?? 0)));
  const values: number[] = [];
  let total = running ? [...byDay].filter(([d]) => d < from).reduce((s, [, v]) => s + v, 0) : 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const value = byDay.get(d) ?? 0;
    total += value;
    values.push(running ? total : value);
  }
  return values;
}

export function Sparkline({ values, width = 120, height = 40, className }: { values: number[]; width?: number; height?: number; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const series = values.length > 1 ? values : [0, ...values];
  const max = Math.max(1, ...series);
  const points = series.map((v, i) => [(i / (series.length - 1)) * width, height - 4 - (v / max) * (height - 10)] as const);
  const line = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const [lx, ly] = points[points.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} style={{ overflow: "visible" }} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b8862a" stopOpacity={0.3} />
          <stop offset="100%" stopColor="#b8862a" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path className="curve-wipe" d={`${line}L${width},${height}L0,${height}Z`} fill={`url(#${id})`} />
      <path className="curve-draw" pathLength={1} d={line} fill="none" stroke="var(--color-data-in)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle className="dot-pop" style={{ "--d": "1.6s" } as CSSProperties} cx={lx} cy={ly} r={3.5} fill="var(--color-data-in)" stroke="#fff" strokeWidth={2} />
    </svg>
  );
}
