// Dropdowns and date pickers for management screens, built on PrimeReact and
// themed to match the app. Values stay plain strings: "" means nothing chosen,
// dates are "YYYY-MM-DD" and date-times "YYYY-MM-DDTHH:MM" in Nairobi time.

import "@/styles/prime.css";

import { clsx } from "clsx";
import { Calendar } from "primereact/calendar";
import { Dropdown } from "primereact/dropdown";
import { useEffect, useState } from "react";

type Tone = "normal" | "invalid" | "uncertain";

function toneClass(tone: Tone): string | undefined {
  if (tone === "invalid") return "p-invalid";
  if (tone === "uncertain") return "is-uncertain";
  return undefined;
}

export interface ChoiceOption {
  value: string;
  label: string;
}

interface ChoiceProps {
  id: string;
  value: string;
  options: ChoiceOption[];
  onChange: (value: string) => void;
  /** Shown when nothing is chosen. */
  placeholder?: string;
  /** Offer a button that clears the choice back to "". */
  clearable?: boolean;
  tone?: Tone;
  disabled?: boolean;
  className?: string;
}

export function Choice({ id, value, options, onChange, placeholder = "Choose…", clearable, tone = "normal", disabled, className }: ChoiceProps) {
  return (
    <Dropdown
      inputId={id}
      value={value === "" ? null : value}
      options={options}
      optionLabel="label"
      optionValue="value"
      onChange={(e) => onChange(e.value == null ? "" : String(e.value))}
      placeholder={placeholder}
      showClear={clearable && value !== ""}
      filter={options.length > 8}
      filterPlaceholder="Search"
      disabled={disabled}
      aria-invalid={tone === "invalid" || undefined}
      className={clsx("w-full", toneClass(tone), className)}
    />
  );
}

/** Small screens get the touch-friendly full-screen picker. */
function useCompact(): boolean {
  const query = "(max-width: 640px)";
  const [compact, setCompact] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return compact;
}

const pad = (n: number) => String(n).padStart(2, "0");

// The Date only carries wall-clock fields, so the device's own time zone never matters.
function wallClock(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0));
}

function dateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface DateProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  tone?: Tone;
  placeholder?: string;
  className?: string;
}

export function DateField({ id, value, onChange, tone = "normal", placeholder = "Choose a date", className }: DateProps) {
  const compact = useCompact();
  return (
    <Calendar
      inputId={id}
      value={wallClock(value)}
      onChange={(e) => onChange(e.value instanceof Date ? dateString(e.value) : "")}
      dateFormat="d M yy"
      placeholder={placeholder}
      showIcon
      showButtonBar
      touchUI={compact}
      readOnlyInput={compact}
      className={clsx(toneClass(tone), className)}
    />
  );
}

export function DateTimeField({ id, value, onChange, tone = "normal", placeholder = "Date and time", className }: DateProps) {
  const compact = useCompact();
  return (
    <Calendar
      inputId={id}
      value={wallClock(value)}
      onChange={(e) =>
        onChange(e.value instanceof Date ? `${dateString(e.value)}T${pad(e.value.getHours())}:${pad(e.value.getMinutes())}` : "")
      }
      dateFormat="d M yy"
      showTime
      hourFormat="24"
      placeholder={placeholder}
      showIcon
      touchUI={compact}
      readOnlyInput={compact}
      className={clsx(toneClass(tone), className)}
    />
  );
}
