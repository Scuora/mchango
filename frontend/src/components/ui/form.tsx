import { clsx } from "clsx";
import { AlertTriangle } from "lucide-react";
import type { ComponentProps, InputHTMLAttributes, ReactNode } from "react";

const control =
  "w-full rounded-lg border bg-white px-3 text-[16px] text-stone-900 placeholder:text-stone-400 " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-plum-600 " +
  "disabled:bg-stone-100 disabled:text-stone-500";

type Tone = "normal" | "invalid" | "uncertain";

function toneClass(tone: Tone): string {
  if (tone === "invalid") return "border-brick-600 bg-brick-50/40";
  if (tone === "uncertain") return "border-ochre-500 bg-ochre-50 ring-1 ring-ochre-400";
  return "border-stone-300";
}

interface ControlProps {
  tone?: Tone;
}

export function Input({ tone = "normal", className, ...props }: ComponentProps<"input"> & ControlProps) {
  return <input className={clsx(control, "min-h-11 py-2", toneClass(tone), className)} aria-invalid={tone === "invalid" || undefined} {...props} />;
}

export function Textarea({ tone = "normal", className, ...props }: ComponentProps<"textarea"> & ControlProps) {
  return <textarea className={clsx(control, "py-2.5 leading-relaxed", toneClass(tone), className)} aria-invalid={tone === "invalid" || undefined} {...props} />;
}

interface FieldProps {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: string;
  /** Shown when a value was read but must be checked. */
  uncertain?: string | false;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}

/** A label, the control, and its hint, uncertainty note or error. */
export function Field({ label, htmlFor, hint, error, uncertain, optional, children, className }: FieldProps) {
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-stone-800">
        {label}
        {optional && <span className="ml-1 font-normal text-stone-500">(optional)</span>}
      </label>
      {children}
      {uncertain && !error && (
        <p className="flex items-start gap-1.5 text-sm text-ochre-800" id={`${htmlFor}-uncertain`}>
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {uncertain}
        </p>
      )}
      {error && (
        <p className="text-sm font-medium text-brick-700" id={`${htmlFor}-error`} role="alert">
          {error}
        </p>
      )}
      {hint && !error && <p className="text-sm text-stone-500">{hint}</p>}
    </div>
  );
}

export function Checkbox({ label, hint, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label className={clsx("flex min-h-11 cursor-pointer items-start gap-3 py-2", className)}>
      <input
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 rounded border-stone-400 accent-plum-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-600"
        {...props}
      />
      <span className="flex flex-col">
        <span className="text-[15px] text-stone-900">{label}</span>
        {hint && <span className="text-sm text-stone-500">{hint}</span>}
      </span>
    </label>
  );
}

interface RadioOption<T extends string> {
  value: T;
  label: ReactNode;
  hint?: ReactNode;
}

export function RadioGroup<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
}: {
  name: string;
  legend: ReactNode;
  value: T;
  options: RadioOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-sm font-medium text-stone-800">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={clsx(
              "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[15px]",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-plum-600",
              value === option.value ? "border-plum-600 bg-plum-50 text-plum-950" : "border-stone-300 bg-white text-stone-800",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
