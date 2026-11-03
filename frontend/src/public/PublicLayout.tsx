import { clsx } from "clsx";
import { ChevronRight, Flame, Flower2, HandCoins, Menu, Share2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useOutletContext } from "react-router";
import { LoadState } from "@/components/LoadState";
import { EmptyState } from "@/components/ui/misc";
import { ApiError, useResource } from "@/lib/api";
import { showBootMemorial, useDismissBoot } from "@/lib/boot";
import { useReveal } from "@/lib/reveal";
import { formatNairobi } from "@/lib/time";
import type { PublicPage } from "@/lib/types";
import { LangProvider, LangToggle, useLang, useTr } from "./i18n";
import { sharePage } from "./share";

interface PublicContext {
  page: PublicPage;
}

export function usePublicPage(): PublicPage {
  return useOutletContext<PublicContext>().page;
}

const LINKS: { to: string; label: [string, string]; end?: boolean }[] = [
  { to: "/", label: ["Home", "Nyumbani"], end: true },
  { to: "/updates", label: ["Updates", "Taarifa"] },
  { to: "/contributions", label: ["Contributions", "Michango"] },
  { to: "/expenses", label: ["Expenses", "Matumizi"] },
  { to: "/trends", label: ["Trends", "Mwenendo"] },
  { to: "/check", label: ["Check my contribution", "Hakiki mchango"] },
];

/**
 * The pinned announcement (such as the burial date) across the top of every
 * page, on every visit. It can be hidden, but only until the next visit.
 */
function Ribbon({ page }: { page: PublicPage }) {
  const tr = useTr();
  const pinned = page.announcements.find((a) => a.pinned);
  const [hidden, setHidden] = useState(false);
  if (!pinned || hidden) return null;
  const { place, map_url } = page.fundraiser.funeral;
  const to = `/updates/${pinned.id}`;
  return (
    <div role="region" aria-label={tr("Important announcement", "Tangazo muhimu")} className="ribbon-in relative overflow-hidden bg-plum-950 text-[#f6efe4]">
      <div aria-hidden className="ribbon-sheen pointer-events-none absolute inset-0" />
      <div className="relative mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 md:px-6">
        <Flame className="flicker size-5 shrink-0 text-ochre-300" aria-hidden />
        <Link to={to} className="min-w-0 flex-1 font-display text-[17px] leading-snug text-[#f6efe4] no-underline hover:text-white hover:no-underline sm:text-[18px]">
          {tr(pinned.title, pinned.title_sw || pinned.title)}
        </Link>
        <Link
          to={to}
          className="press inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full bg-ochre-300 px-3.5 text-[14px] font-semibold text-plum-950 no-underline hover:bg-ochre-200 hover:no-underline"
        >
          {place || map_url ? tr("Directions", "Maelekezo") : tr("Details", "Maelezo")}
          <ChevronRight className="size-4" aria-hidden />
        </Link>
        <button
          type="button"
          aria-label={tr("Hide until your next visit", "Ficha hadi utakaporudi")}
          onClick={() => setHidden(true)}
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-[#f6efe4]/70 hover:bg-white/10 hover:text-white"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/**
 * Fetches the public data again on every page visited and whenever the tab is
 * shown again, so totals, lists and trends always reflect the latest records.
 * The figures already on screen stay there until the new ones arrive.
 */
function useFreshOnVisit(pathname: string, reload: () => void) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false; // the first load is already under way
      return;
    }
    reload();
  }, [pathname, reload]);
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [reload]);
}

/** The public site: the public data, shared by every page and refreshed on each visit. */
export function PublicLayout() {
  return (
    <LangProvider>
      <PublicSite />
    </LangProvider>
  );
}

function PublicSite() {
  const lang = useLang();
  const tr = useTr();
  const resource = useResource<PublicPage>("/api/public/page");
  const { pathname, hash } = useLocation();
  useFreshOnVisit(pathname, resource.reload);
  useReveal();
  useEffect(() => {
    if (!hash) window.scrollTo({ top: 0 });
  }, [pathname, hash]);
  const page = resource.data;
  const fundraiser = page?.fundraiser;

  // The opening screen shows his portrait; once the data is ready it shows his
  // name for a moment and then fades into the page.
  useEffect(() => {
    if (fundraiser) showBootMemorial(fundraiser.memorial_name, fundraiser.memorial_dates, fundraiser.memorial_tribute);
  }, [fundraiser]);
  useDismissBoot(Boolean(page) || Boolean(resource.error), page ? { minVisibleMs: 2600, holdNameMs: 1500 } : undefined);

  useEffect(() => {
    if (fundraiser) {
      document.title = fundraiser.memorial_name ? `${fundraiser.memorial_name} – ${lang === "sw" ? "michango ya mazishi" : "funeral contributions"}` : fundraiser.name;
    }
  }, [fundraiser, lang]);

  if (!page) {
    const unpublished = resource.error instanceof ApiError && resource.error.status === 404;
    return (
      <div className="min-h-dvh bg-stone-50 px-4 pt-[18vh] text-[17px]">
        <div className="mx-auto max-w-md">
          {unpublished ? (
            <EmptyState icon={<Flower2 className="size-8" />} title={tr("This page hasn't been published yet", "Ukurasa huu bado haujachapishwa")}>
              {tr("Please check back later.", "Tafadhali rudi baadaye.")}
            </EmptyState>
          ) : (
            <LoadState loading={resource.loading} error={resource.error} onRetry={resource.reload} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh overflow-x-clip bg-stone-50 pb-24 text-[17px] text-stone-900 md:pb-0">
      <Ribbon page={page} />
      {page.is_demo && (
        <p className="bg-ochre-100 px-4 py-1.5 text-center text-[14px] text-ochre-900">
          {tr("Demo: every name and record on this page is fictional.", "Maonyesho: kila jina na rekodi kwenye ukurasa huu ni ya kubuni.")}
        </p>
      )}
      <PublicNav page={page} />
      {/* Keyed by language too, so a switch redraws every date and label. */}
      <div key={`${pathname}-${lang}`} className="page-enter">
        <Outlet context={{ page } satisfies PublicContext} />
      </div>
      <footer className="mx-auto max-w-3xl space-y-2 px-4 pt-10 pb-12 text-center">
        <p className="font-display text-2xl text-stone-800">{tr("Thank you for standing with the family.", "Asanteni kwa kusimama pamoja na familia.")}</p>
        {page.last_updated && (
          <p className="text-[15px] text-stone-500">
            {tr("Last updated", "Imesasishwa")} {formatNairobi(page.last_updated)} ({tr("Nairobi time", "saa za Nairobi")})
          </p>
        )}
      </footer>
      <ActionBar page={page} />
    </div>
  );
}

/**
 * The site navigation: transparent over the memorial header, frosted plum glass
 * once you scroll. Desktop shows the pages in a capsule with a sliding
 * highlight; phones get a menu sheet with large links.
 */
function PublicNav({ page }: { page: PublicPage }) {
  const tr = useTr();
  const lang = useLang();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const capsule = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const f = page.fundraiser;
  const name = f.memorial_name ?? f.name;
  const overHero = pathname === "/" && !scrolled && !open;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => setOpen(false), [pathname]);

  // The highlight slides to the current page; it re-measures when fonts load or the window resizes.
  useLayoutEffect(() => {
    const box = capsule.current;
    if (!box) return;
    const measure = () => {
      const active = box.querySelector<HTMLElement>('[aria-current="page"]');
      setIndicator(active ? { left: active.offsetLeft, width: active.offsetWidth } : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [pathname]);

  function contribute() {
    setOpen(false);
    navigate("/contribute");
  }

  return (
    <header
      className={clsx(
        "sticky top-0 z-40 text-[#f6efe4] transition-[background-color,box-shadow] duration-300",
        overHero ? "bg-transparent" : "bg-[#1e1625]/85 shadow-[0_10px_30px_-14px_rgb(0_0_0/0.55)] backdrop-blur-xl",
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 md:h-16 md:px-6">
        <Link to="/" className="flex min-w-0 items-center gap-2.5 rounded-full py-1 pr-2 text-[#f6efe4] no-underline hover:no-underline">
          {f.photo_url ? (
            <img src={f.photo_url} alt="" className="size-8 shrink-0 rounded-full object-cover ring-1 ring-[#ffd086]/70 md:size-9" />
          ) : (
            <Flower2 className="size-6 shrink-0 text-[#ffd086]" strokeWidth={1.4} aria-hidden />
          )}
          <span className="truncate font-display text-lg leading-none md:text-xl">{name}</span>
        </Link>

        <nav aria-label={tr("Fundraiser pages", "Kurasa za mchango")} className="ml-auto hidden md:block">
          <div ref={capsule} className="relative flex items-center rounded-full bg-white/[0.07] p-1 ring-1 ring-white/10">
            {indicator && (
              <span
                aria-hidden
                className="absolute top-1 bottom-1 rounded-full bg-white/[0.16] shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] transition-[left,width] duration-300 ease-out"
                style={{ left: indicator.left, width: indicator.width }}
              />
            )}
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  clsx(
                    "relative z-10 rounded-full px-3.5 py-1.5 text-[15px] whitespace-nowrap no-underline transition-colors hover:no-underline",
                    "focus-visible:outline-2 focus-visible:outline-[#ffd086]",
                    isActive ? "text-white" : "text-[#f6efe4]/75 hover:text-white",
                  )
                }
              >
                {tr(link.label[0], link.label[1])}
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <LangToggle />
          <button
            type="button"
            onClick={() => void sharePage(page, lang)}
            className="press flex size-10 items-center justify-center rounded-full text-[#f6efe4]/85 ring-1 ring-white/15 hover:bg-white/10 hover:text-white"
            aria-label={tr("Share this page", "Shiriki ukurasa huu")}
            title={tr("Share", "Shiriki")}
          >
            <Share2 className="size-[18px]" aria-hidden />
          </button>
          {f.giving && (
            <button
              type="button"
              onClick={contribute}
              className="press flex h-10 items-center gap-2 rounded-full bg-[#e8c27a] px-4 text-[15px] font-semibold text-[#1e1625] shadow-[0_6px_20px_-8px_rgb(232_194_122/0.8)] hover:bg-[#f0cf8e]"
            >
              <HandCoins className="size-4" aria-hidden />
              {tr("Contribute", "Changia")}
            </button>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 md:hidden">
          <LangToggle compact />
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="public-menu"
            aria-label={open ? tr("Close menu", "Funga menyu") : tr("Open menu", "Fungua menyu")}
            className="press flex size-11 items-center justify-center rounded-full ring-1 ring-white/15 hover:bg-white/10"
          >
            {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>
      </div>

      {open && (
        <div id="public-menu" className="sheet-in border-t border-white/10 px-4 pt-2 pb-5 md:hidden">
          <nav aria-label={tr("Fundraiser pages", "Kurasa za mchango")} className="flex flex-col">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  clsx(
                    "flex min-h-13 items-center justify-between rounded-xl px-3 text-[17px] no-underline hover:no-underline",
                    isActive ? "bg-white/10 font-semibold text-white" : "text-[#f6efe4]/85 active:bg-white/5",
                  )
                }
              >
                {tr(link.label[0], link.label[1])}
                <ChevronRight className="size-5 opacity-50" aria-hidden />
              </NavLink>
            ))}
          </nav>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {f.giving && (
              <button
                type="button"
                onClick={contribute}
                className="press flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#e8c27a] font-semibold text-[#1e1625]"
              >
                <HandCoins className="size-5" aria-hidden /> {tr("Contribute", "Changia")}
              </button>
            )}
            <button
              type="button"
              onClick={() => void sharePage(page, lang)}
              className={clsx(
                "press flex min-h-12 items-center justify-center gap-2 rounded-xl font-semibold text-white ring-1 ring-white/20",
                !f.giving && "col-span-2",
              )}
            >
              <Share2 className="size-5" aria-hidden /> {tr("Share", "Shiriki")}
            </button>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
            <span className="text-[15px] text-[#f6efe4]/75">{tr("Language", "Lugha")}</span>
            <LangToggle full />
          </div>
        </div>
      )}
    </header>
  );
}

/** Phones: giving and sharing stay in reach once the M-Pesa card scrolls away. */
function ActionBar({ page }: { page: PublicPage }) {
  const tr = useTr();
  const lang = useLang();
  const navigate = useNavigate();
  const contribute = () => navigate("/contribute");
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex gap-3 border-t border-stone-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
      {page.fundraiser.giving && (
        <BarButton primary onClick={contribute} icon={<HandCoins className="size-5" aria-hidden />}>
          {tr("How to contribute", "Jinsi ya kuchangia")}
        </BarButton>
      )}
      <BarButton grow={!page.fundraiser.giving} onClick={() => void sharePage(page, lang)} icon={<Share2 className="size-5" aria-hidden />}>
        {tr("Share", "Shiriki")}
      </BarButton>
    </div>
  );
}

function BarButton({
  primary,
  grow,
  onClick,
  icon,
  children,
}: {
  primary?: boolean;
  grow?: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "press flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-[16px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-600",
        primary ? "flex-1 bg-[#2e2338] text-white active:bg-[#1e1625]" : "border border-stone-300 bg-white text-stone-900 active:bg-stone-100",
        !primary && (grow ? "flex-1" : "min-w-28"),
      )}
    >
      {icon}
      {children}
    </button>
  );
}
