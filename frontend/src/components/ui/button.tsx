import { clsx } from "clsx";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium no-underline transition-[color,background-color,transform] duration-150 select-none hover:no-underline active:scale-[0.98] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-600 " +
  "disabled:cursor-not-allowed disabled:opacity-55";

const variants: Record<Variant, string> = {
  primary: "bg-plum-700 text-white hover:bg-plum-800 active:bg-plum-900",
  secondary: "border border-stone-300 bg-white text-stone-900 hover:bg-stone-50 active:bg-stone-100",
  ghost: "text-stone-700 hover:bg-stone-100 active:bg-stone-200",
  danger: "bg-brick-700 text-white hover:bg-brick-800 active:bg-brick-900",
};

const sizes: Record<Size, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4 text-[15px]",
  lg: "min-h-13 px-5 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string): string {
  return clsx(base, variants[variant], sizes[size], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  busy?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = "primary", size = "md", busy, icon, className, children, disabled, type, ...props }: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={buttonClass(variant, size, className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

interface ButtonLinkProps extends LinkProps {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export function ButtonLink({ variant = "primary", size = "md", icon, className, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={buttonClass(variant, size, typeof className === "string" ? className : undefined)} {...props}>
      {icon}
      {children}
    </Link>
  );
}
