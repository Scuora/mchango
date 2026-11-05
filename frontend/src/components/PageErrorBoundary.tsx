import { RefreshCw, TriangleAlert } from "lucide-react";
import { Component, type ReactNode } from "react";
import { isStaleBuildError } from "@/lib/lazyPages";

interface Props {
  children: ReactNode;
  /** Clears the error when it changes, e.g. the path, so moving to another page recovers. */
  resetKey?: string;
}

/**
 * Catches a page that fails to load or render, so the rest of the app stays usable.
 * A page file missing after a deploy gets a calm explanation; reloading is the
 * visitor's choice, never automatic.
 */
export class PageErrorBoundary extends Component<Props, { error: unknown }> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidUpdate(previous: Props) {
    if (this.state.error !== null && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    const stale = isStaleBuildError(error);
    const Icon = stale ? RefreshCw : TriangleAlert;
    return (
      <div role="alert" className="mx-auto max-w-md px-4 py-16 text-center">
        <span className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-[#efe9f3] text-[#4b3a5a]" aria-hidden>
          <Icon className="size-6" />
        </span>
        <h2 className="font-display text-2xl font-semibold text-stone-900">{stale ? "This page has been updated" : "This page could not be shown"}</h2>
        <p className="mt-2 text-stone-600">
          {stale
            ? "A newer version of the site was published while this tab was open. Load it to carry on; anything already saved is safe."
            : "Something went wrong while showing this page. Nothing was changed."}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-[#1b1917] px-5 font-semibold text-white hover:bg-[#0b0a09]"
        >
          <RefreshCw className="size-4" aria-hidden />
          {stale ? "Load the latest version" : "Try again"}
        </button>
      </div>
    );
  }
}
