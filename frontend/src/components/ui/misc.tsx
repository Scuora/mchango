import { clsx } from "clsx";
import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={clsx("rounded-xl border border-stone-200 bg-white shadow-sm", className)}>{children}</section>;
}

export function CardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-stone-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-stone-600">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("px-4 py-4 sm:px-5", className)}>{children}</div>;
}

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const badgeTones: Record<Tone, string> = {
  neutral: "bg-stone-100 text-stone-700 ring-stone-200",
  info: "bg-plum-50 text-plum-800 ring-plum-200",
  success: "bg-sage-50 text-sage-800 ring-sage-200",
  warning: "bg-ochre-50 text-ochre-900 ring-ochre-300",
  danger: "bg-brick-50 text-brick-800 ring-brick-200",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", badgeTones[tone], className)}>
      {children}
    </span>
  );
}

const noticeStyles: Record<Exclude<Tone, "neutral">, { box: string; icon: ReactNode }> = {
  info: { box: "border-plum-200 bg-plum-50 text-plum-950", icon: <Info className="size-5 shrink-0 text-plum-700" aria-hidden /> },
  success: { box: "border-sage-200 bg-sage-50 text-sage-950", icon: <CheckCircle2 className="size-5 shrink-0 text-sage-700" aria-hidden /> },
  warning: { box: "border-ochre-300 bg-ochre-50 text-ochre-950", icon: <TriangleAlert className="size-5 shrink-0 text-ochre-700" aria-hidden /> },
  danger: { box: "border-brick-200 bg-brick-50 text-brick-950", icon: <AlertCircle className="size-5 shrink-0 text-brick-700" aria-hidden /> },
};

export function Notice({ tone = "info", title, children, className }: { tone?: Exclude<Tone, "neutral">; title?: ReactNode; children?: ReactNode; className?: string }) {
  const style = noticeStyles[tone];
  return (
    <div className={clsx("flex gap-3 rounded-lg border px-4 py-3 text-sm", style.box, className)} role={tone === "danger" ? "alert" : undefined}>
      {style.icon}
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed">{children}</div>}
      </div>
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-stone-600" role="status">
      <Loader2 className="size-5 animate-spin text-plum-700" aria-hidden />
      {label}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      {icon && <div className="text-stone-400">{icon}</div>}
      <p className="font-medium text-stone-800">{title}</p>
      {children && <div className="max-w-md text-sm text-stone-600">{children}</div>}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  tabs: { value: T; label: ReactNode; count?: number }[];
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto rounded-lg bg-stone-100 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={clsx(
            "flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-plum-600",
            value === tab.value ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900",
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={clsx("rounded-full px-1.5 text-xs tabular-nums", value === tab.value ? "bg-stone-100" : "bg-stone-200")}>{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/** A label/value pair for detail lists. */
export function Detail({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
      <dt className="text-sm text-stone-500 sm:w-44 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 text-[15px] break-words text-stone-900">{children}</dd>
    </div>
  );
}
