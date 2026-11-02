import { clsx } from "clsx";
import { ExternalLink, FileDown, FileText, HandCoins, Home, List, LogOut, Megaphone, Menu, PlusCircle, Settings, Share2, X, type LucideIcon } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { RequireAuth, useAuth } from "@/features/auth";
import { useResource } from "@/lib/api";
import { useDismissBoot } from "@/lib/boot";
import type { Fundraiser } from "@/lib/types";
import { LoadState } from "./LoadState";
import { ButtonLink } from "./ui/button";
import { Notice, Spinner } from "./ui/misc";

interface NavItem {
  to: string;
  label: string;
  short: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: "/manage", label: "Overview", short: "Overview", icon: Home, end: true },
  { to: "/manage/transactions", label: "Transactions", short: "Records", icon: List },
  { to: "/manage/add", label: "Add transaction", short: "Add", icon: PlusCircle },
  { to: "/manage/pledges", label: "Pledges", short: "Pledges", icon: HandCoins },
  { to: "/manage/statements", label: "Statements", short: "Statements", icon: FileText },
  { to: "/manage/announcements", label: "Announcements", short: "Updates", icon: Megaphone },
  { to: "/manage/reports", label: "Reports (PDF)", short: "Reports", icon: FileDown },
  { to: "/manage/share", label: "Share on WhatsApp", short: "Share", icon: Share2 },
  { to: "/manage/settings", label: "Settings", short: "Settings", icon: Settings },
];

/** Bottom tabs on phones: the four most used places, plus "More" for the rest. */
const MORE = ["/manage/pledges", "/manage/share", "/manage/announcements", "/manage/reports", "/manage/settings"];
const TABS = NAV.filter((item) => !MORE.includes(item.to));

export function ManageLayout() {
  return (
    <RequireAuth
      fallback={(state) => (
        <div className="mx-auto max-w-md px-4 pt-[20vh]">
          {state === "checking" ? (
            <LoadState loading error={null} onRetry={() => undefined} label="Checking your session…" />
          ) : (
            <>
              <BootDone />
              <LoadState loading={false} error={state.error} onRetry={state.retry} />
            </>
          )}
        </div>
      )}
    >
      <Shell />
    </RequireAuth>
  );
}

function BootDone() {
  useDismissBoot(true);
  return null;
}

/**
 * The management app frame: a top bar, a sidebar (desktop) or tab bar (phone),
 * and one scrolling content area. The frame itself never scrolls.
 */
function Shell() {
  useDismissBoot(true);
  const { user, signOut } = useAuth();
  const settings = useResource<Fundraiser>("/api/manage/settings");
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMoreOpen(false), [pathname]);
  const fundraiser = settings.data;
  const name = fundraiser?.memorial_name || fundraiser?.name || "Fundraiser";
  const photo = fundraiser?.memorial_photo_updated_at
    ? `/api/public/memorial-photo?v=${encodeURIComponent(fundraiser.memorial_photo_updated_at)}`
    : null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-stone-50">
      <header className="z-30 flex h-14 shrink-0 items-center gap-3 border-b border-stone-200 bg-white px-3 sm:px-4 md:h-16">
        <Link to="/manage" className="flex min-w-0 items-center gap-3 rounded-lg py-1 pr-2 text-stone-900 no-underline hover:no-underline">
          {photo ? (
            <img src={photo} alt="" className="size-9 shrink-0 rounded-full object-cover ring-2 ring-ochre-300/60 md:size-10" />
          ) : (
            <span className="size-9 shrink-0 rounded-full bg-plum-100 md:size-10" aria-hidden />
          )}
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-display text-lg font-semibold md:text-xl">{name}</span>
            <span className="block text-[11px] font-medium tracking-wide text-stone-500 uppercase">Management</span>
          </span>
        </Link>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <ButtonLink to="/manage/add" size="sm" className="hidden sm:inline-flex" icon={<PlusCircle className="size-4" aria-hidden />}>
            Add transaction
          </ButtonLink>
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="flex size-10 items-center justify-center rounded-lg text-stone-700 hover:bg-stone-100 lg:w-auto lg:gap-2 lg:px-3 lg:text-sm lg:no-underline"
            aria-label="Open the public page"
          >
            <ExternalLink className="size-5 lg:size-4" aria-hidden />
            <span className="hidden lg:inline">Public page</span>
          </a>
          <div className="hidden items-center gap-2 border-l border-stone-200 pl-3 text-sm md:flex">
            <span className="text-stone-500">
              Signed in as <span className="font-medium text-stone-800">{user.username}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex size-10 items-center justify-center rounded-lg text-stone-700 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-plum-600"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="size-5" aria-hidden />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-stone-200 bg-white md:flex">
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label="Management">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  clsx(
                    "flex min-h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-medium no-underline hover:no-underline",
                    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-plum-300",
                    isActive ? "bg-plum-100/70 text-plum-900" : "text-stone-700 hover:bg-stone-100",
                  )
                }
              >
                <item.icon className="size-5" aria-hidden />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <p className="border-t border-stone-100 px-5 py-3 text-xs leading-relaxed text-stone-500">
            Records stay private. Only what you publish appears on the public page.
          </p>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto overscroll-contain" id="content">
          <div className="mx-auto w-full max-w-6xl px-4 pt-4 pb-10 sm:px-6 md:pt-6">
            {fundraiser?.is_demo && (
              <Notice tone="warning" className="mb-4" title="Demo data">
                This database holds fictional demo records. Use a separate database for the real fundraiser.
              </Notice>
            )}
            <Suspense fallback={<Spinner />}>
              <div key={pathname} className="page-enter">
                <Outlet />
              </div>
            </Suspense>
          </div>
        </main>
      </div>

      {moreOpen && (
        <div className="fixed inset-0 z-40 bg-stone-900/30 md:hidden" onClick={() => setMoreOpen(false)} aria-hidden />
      )}
      {moreOpen && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-50 rounded-t-2xl border-t border-stone-200 bg-white p-3 shadow-2xl md:hidden" role="dialog" aria-label="More">
          <div className="mb-1 flex items-center justify-between px-2">
            <p className="text-sm font-medium text-stone-500">More</p>
            <button type="button" onClick={() => setMoreOpen(false)} className="flex size-10 items-center justify-center rounded-lg text-stone-600 hover:bg-stone-100" aria-label="Close">
              <X className="size-5" aria-hidden />
            </button>
          </div>
          {NAV.filter((item) => MORE.includes(item.to)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  "flex min-h-12 items-center gap-3 rounded-lg px-3 text-[16px] font-medium no-underline hover:no-underline",
                  isActive ? "bg-plum-50 text-plum-900" : "text-stone-800 hover:bg-stone-100",
                )
              }
            >
              <item.icon className="size-5" aria-hidden />
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
      <nav className="relative z-50 grid shrink-0 grid-cols-5 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Management">
        {TABS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              clsx(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium no-underline hover:no-underline",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-plum-600",
                isActive ? "text-plum-800" : "text-stone-600",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className={clsx("flex h-7 w-12 items-center justify-center rounded-full", isActive && "bg-plum-100")}>
                  <item.icon className={clsx("size-5", isActive && "stroke-[2.4]")} aria-hidden />
                </span>
                {item.short}
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          className={clsx(
            "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-plum-600",
            moreOpen || MORE.includes(pathname) ? "text-plum-800" : "text-stone-600",
          )}
        >
          <span className={clsx("flex h-7 w-12 items-center justify-center rounded-full", (moreOpen || MORE.includes(pathname)) && "bg-plum-100")}>
            <Menu className="size-5" aria-hidden />
          </span>
          More
        </button>
      </nav>
    </div>
  );
}
