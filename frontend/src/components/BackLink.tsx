import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { lastUrl, previousUrl } from "@/lib/places";

/**
 * "← All transactions": back to the list as it was left, filters and scroll
 * included. Coming straight from that list, it steps back in the history, so the
 * browser's Back button does not return to this page.
 */
export function BackLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  const navigate = useNavigate();
  const target = lastUrl(to);
  const steps = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  return (
    <Link
      to={target}
      className={className}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (previousUrl() === target && steps > 0) {
          e.preventDefault();
          navigate(-1);
        }
      }}
    >
      <ArrowLeft className="size-4" aria-hidden /> {children}
    </Link>
  );
}
