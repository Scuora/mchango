import { RefreshCw, RotateCw } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { isStaleBuildError } from "@/lib/lazyPages";
import { Button } from "./ui/button";
import { Notice } from "./ui/misc";

/** The shared loading / failure / retry display for a resource without data yet. */
export function LoadState({ loading, error, onRetry, label }: { loading: boolean; error: unknown; onRetry: () => void; label?: string }) {
  if (error && !loading) {
    return (
      <Notice tone="danger" title="Could not load this">
        <p>{errorMessage(error)}</p>
        <Button variant="secondary" size="sm" className="mt-2" icon={<RotateCw className="size-4" aria-hidden />} onClick={onRetry}>
          Try again
        </Button>
      </Notice>
    );
  }
  // A calm shimmering placeholder while the page loads.
  return (
    <div className="space-y-3 py-4" role="status" aria-label={label ?? "Loading"}>
      <div className="skeleton h-8 w-2/5" />
      <div className="skeleton h-24 w-full" />
      <div className="skeleton h-24 w-full" />
      <span className="sr-only">{label ?? "Loading…"}</span>
    </div>
  );
}

/** A failed save, shown above a form's buttons. */
export function SaveError({ error }: { error: unknown }) {
  if (!error) return null;
  // A file this action needs is gone because the site was updated while the tab was open.
  if (isStaleBuildError(error)) {
    return (
      <Notice tone="warning" title="This page has been updated">
        <p>A newer version of the site was published while this tab was open. Load it, then try again; anything already saved is safe.</p>
        <Button variant="secondary" size="sm" className="mt-2" icon={<RefreshCw className="size-4" aria-hidden />} onClick={() => window.location.reload()}>
          Load the latest version
        </Button>
      </Notice>
    );
  }
  return <Notice tone="danger">{errorMessage(error)}</Notice>;
}
