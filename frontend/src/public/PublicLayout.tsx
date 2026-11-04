import { clsx } from "clsx";
import { CalendarDays, ChevronDown, ChevronRight, Flame, Flower2, HandCoins, House, ListOrdered, Megaphone, Menu, Navigation, Receipt, SearchCheck, Share2, TrendingUp, Trophy, X, type LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useOutletContext } from "react-router";
import { LoadState } from "@/components/LoadState";
import { EmptyState } from "@/components/ui/misc";
import { ApiError, useResource } from "@/lib/api";
import { showBootMemorial, useDismissBoot } from "@/lib/boot";
import { useReveal } from "@/lib/reveal";
import { coordinatesIn, directionsLink } from "@/lib/maps";
import { formatNairobi } from "@/lib/time";
import type { PublicPage } from "@/lib/types";
import { LangProvider, LangToggle, useLang, useTr } from "./i18n";
import { PROGRAMME, dayStatus } from "./programme";
import { DayBadge, TodayPill, isToday, pick, useNow } from "./programmeParts";
import { sharePage } from "./share";

interface PublicContext {
  page: PublicPage;
}

export function usePublicPage(): PublicPage {
  return useOutletContext<PublicContext>().page;
}

type Pair = [string, string];

// The navbar keeps four entries: Home, the funeral programme, Updates and the
// money pages, which sit together under Contributions.
const MONEY_LINKS: { to: string; label: Pair; hint: Pair; icon: LucideIcon }[] = [
  { to: "/contributions", label: ["Contributions", "Michango"], hint: ["Every contribution received", "Kila mchango uliopokelewa"], icon: ListOrdered },
  { to: "/challenges", label: ["Challenges", "Changamoto"], hint: ["Giving challenges to join", "Changamoto za kuchangia"], icon: Trophy },
  { to: "/expenses", label: ["Expenses", "Matumizi"], hint: ["How the money is spent", "Jinsi pesa zinavyotumika"], icon: Receipt },
  { to: "/trends", label: ["Trends", "Mwenendo"], hint: ["Giving day by day", "Michango siku kwa siku"], icon: TrendingUp },
  { to: "/check", label: ["Check my contribution", "Hakiki mchango wangu"], hint: ["Confirm yours was received", "Hakikisha mchango wako umepokelewa"], icon: SearchCheck },
];

/** Where to go for directions to the burial, when the settings have a map link. */
function directionsTo(page: PublicPage): string | null {
  const { map_url } = page.fundraiser.funeral;
  const coords = coordinatesIn(map_url);
  return coords ? directionsLink(coords) : map_url;
}

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
      {/* Keyed by language too, so a switch redraws every date and label. Pages that open with a
          dark header under the transparent navbar appear at once: fading them in would leave the
          navbar over a pale page for a moment, a blink. Their header text still animates in. */}
      <div key={`${pathname}-${lang}`} className={pathname === "/" || pathname.startsWith("/programme") ? undefined : "page-enter"}>
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
 * The site navigation: transparent over the memorial and programme headers,
 * frosted plum glass once you scroll. Desktop shows four entries in a capsule
 * with a sliding highlight, two of them opening menus; phones get a menu sheet
 * that opens on the two programme days.
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
  const money = MONEY_LINKS.filter((link) => link.to !== "/challenges" || (page.challenges?.length ?? 0) > 0);
  const inProgramme = pathname.startsWith("/programme");
  const inMoney = money.some((link) => pathname.startsWith(link.to));
  const overHero = (pathname === "/" || inProgramme) && !scrolled && !open;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => setOpen(false), [pathname]);
  // The open sheet is the whole screen on a phone: the page behind it stays put.
  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, [open]);

  // The highlight slides to the current entry; it re-measures when fonts load or the window resizes.
  useLayoutEffect(() => {
    const box = capsule.current;
    if (!box) return;
    const measure = () => {
      const active = box.querySelector<HTMLElement>(':scope > [aria-current="page"], :scope > [data-active="true"]');
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
            <NavLink to="/" end className={({ isActive }) => capsuleLink(isActive)}>
              {tr("Home", "Nyumbani")}
            </NavLink>
            <NavMenu id="menu-programme" label={tr("Programme", "Ratiba")} active={inProgramme} width="w-[23rem]">
              <ProgrammeMenu page={page} />
            </NavMenu>
            <NavLink to="/updates" className={({ isActive }) => capsuleLink(isActive)}>
              {tr("Updates", "Taarifa")}
            </NavLink>
            <NavMenu id="menu-money" label={tr("Contributions", "Michango")} active={inMoney} width="w-[22rem]">
              <div className="space-y-0.5">
                {money.map((link) => (
                  <MenuLink key={link.to} to={link.to} icon={link.icon} label={tr(link.label[0], link.label[1])} hint={tr(link.hint[0], link.hint[1])} />
                ))}
              </div>
            </NavMenu>
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
        <div id="public-menu" className="sheet-in max-h-[calc(100dvh-3.5rem)] overflow-y-auto overscroll-contain border-t border-white/10 px-4 pt-4 pb-6 md:hidden">
          <SheetHeading>{tr("Funeral programme", "Ratiba ya mazishi")}</SheetHeading>
          <SheetProgramme page={page} />

          <nav aria-label={tr("Fundraiser pages", "Kurasa za mchango")} className="mt-5">
            <div className="flex flex-col">
              <SheetLink to="/" end icon={House} label={tr("Home", "Nyumbani")} />
              <SheetLink to="/updates" icon={Megaphone} label={tr("Updates", "Taarifa")} />
            </div>
            <SheetHeading className="mt-5">{tr("Contributions", "Michango")}</SheetHeading>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {money.map((link) => {
                const Icon = link.icon;
                return (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    className={({ isActive }) =>
                      clsx(
                        "press flex min-h-[4.25rem] flex-col justify-between gap-1.5 rounded-xl p-3 text-[15px] leading-tight font-semibold no-underline hover:no-underline",
                        isActive ? "bg-white/[0.14] text-white ring-1 ring-[#e8c27a]/50" : "bg-white/[0.06] text-[#f6efe4]/90 ring-1 ring-white/10 active:bg-white/10",
                        link.to === "/check" && money.length % 2 === 1 && "col-span-2",
                      )
                    }
                  >
                    <Icon className="size-5 text-[#e8c27a]" aria-hidden />
                    {tr(link.label[0], link.label[1])}
                  </NavLink>
                );
              })}
            </div>
          </nav>

          <div className="mt-5 grid grid-cols-2 gap-2">
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

const capsuleLink = (active: boolean) =>
  clsx(
    "relative z-10 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[15px] whitespace-nowrap no-underline transition-colors hover:no-underline lg:px-4",
    "focus-visible:outline-2 focus-visible:outline-[#ffd086]",
    active ? "text-white" : "text-[#f6efe4]/75 hover:text-white",
  );

/**
 * A capsule entry that opens a menu: on click, or on hover with a mouse. It
 * closes on Escape (back to the button), a click outside, leaving it, or moving on.
 */
function NavMenu({ id, label, active, width, children }: { id: string; label: string; active: boolean; width: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const closing = useRef<number | undefined>(undefined);
  // A mouse opens the menu on hover; the click that usually follows must not close it again.
  const hovered = useRef(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  useEffect(() => () => window.clearTimeout(closing.current), []);
  const hover = (show: boolean) => (e: ReactPointerEvent) => {
    if (e.pointerType !== "mouse") return;
    window.clearTimeout(closing.current);
    if (show) {
      hovered.current = true;
      setOpen(true);
    } else closing.current = window.setTimeout(() => setOpen(false), 180);
  };
  // Decided from the hover marker, not `open`: a quick click can arrive before the hover's render.
  function toggle() {
    if (hovered.current) {
      hovered.current = false;
      setOpen(true);
      return;
    }
    setOpen((o) => !o);
  }
  return (
    <div
      ref={wrap}
      data-active={active}
      className="relative z-10"
      onPointerEnter={hover(true)}
      onPointerLeave={hover(false)}
      onBlur={(e) => {
        if (!wrap.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button ref={button} type="button" aria-expanded={open} aria-controls={id} onClick={toggle} className={clsx(capsuleLink(active), "cursor-pointer")}>
        {label}
        <ChevronDown className={clsx("size-4 opacity-70 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div
          id={id}
          className={clsx(
            "menu-in absolute top-full left-1/2 mt-3 -translate-x-1/2 rounded-2xl bg-[#1e1625] p-2 text-left shadow-[0_28px_60px_-24px_rgb(0_0_0/0.75)] ring-1 ring-white/10 backdrop-blur-xl",
            width,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function MenuLink({ to, icon: Icon, label, hint }: { to: string; icon: LucideIcon; label: string; hint: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          "group flex items-center gap-3 rounded-xl px-3 py-2.5 no-underline hover:no-underline focus-visible:outline-2 focus-visible:outline-[#ffd086]",
          isActive ? "bg-white/[0.1]" : "hover:bg-white/[0.06]",
        )
      }
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.07] text-[#e8c27a] ring-1 ring-white/10">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] leading-tight font-semibold text-white">{label}</span>
        <span className="mt-0.5 block text-[13.5px] leading-snug text-[#f6efe4]/60 group-hover:text-[#f6efe4]/75">{hint}</span>
      </span>
    </NavLink>
  );
}

/** The programme menu on desktop: the two days (with what is on today) and directions. */
function ProgrammeMenu({ page }: { page: PublicPage }) {
  const tr = useTr();
  const lang = useLang();
  const now = useNow();
  const directions = directionsTo(page);
  return (
    <div>
      <p className="px-3 pt-2 pb-1.5 text-[11.5px] font-semibold tracking-[0.26em] text-[#e2c88f] uppercase">{tr("Funeral programme", "Ratiba ya mazishi")}</p>
      <div className="space-y-0.5">
        {PROGRAMME.map((day) => {
          const status = dayStatus(day, now);
          return (
            <NavLink
              key={day.id}
              to={`/programme/${day.id}`}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 rounded-xl px-2.5 py-2.5 no-underline hover:no-underline focus-visible:outline-2 focus-visible:outline-[#ffd086]",
                  isActive ? "bg-white/[0.1]" : "hover:bg-white/[0.06]",
                )
              }
            >
              <DayBadge day={day} lang={lang} dark />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[15px] leading-tight font-bold text-white">
                  {pick(day.weekday, lang)}, {pick(day.dateLong, lang).replace(/ \d{4}$/, "")}
                  {isToday(day, now) && status.kind !== "ended" && <TodayPill live={status.kind === "now"} />}
                </span>
                <span className="mt-0.5 block text-[13.5px] leading-snug text-[#f6efe4]/65">{pick(day.title, lang)}</span>
              </span>
            </NavLink>
          );
        })}
      </div>
      {directions && page.fundraiser.funeral.place && (
        <a
          href={directions}
          target="_blank"
          rel="noreferrer"
          className="mt-1 flex items-center gap-3 rounded-xl border-t border-white/10 px-3 pt-3 pb-2.5 text-[14px] font-semibold text-[#f6efe4]/85 no-underline hover:bg-white/[0.06] hover:text-white hover:no-underline"
        >
          <Navigation className="size-4 text-[#e2c88f]" aria-hidden />
          {tr(`Directions to ${page.fundraiser.funeral.place}`, `Maelekezo ya kufika ${page.fundraiser.funeral.place}`)}
        </a>
      )}
    </div>
  );
}

function SheetHeading({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={clsx("px-1 text-[12px] font-semibold tracking-[0.24em] text-[#e8c27a] uppercase", className)}>{children}</p>;
}

/** The phone menu opens on the two programme days, side by side. */
function SheetProgramme({ page }: { page: PublicPage }) {
  const tr = useTr();
  const lang = useLang();
  const now = useNow();
  const directions = directionsTo(page);
  return (
    <div className="mt-2">
      <div className="grid grid-cols-2 gap-2">
        {PROGRAMME.map((day) => {
          const status = dayStatus(day, now);
          return (
            <NavLink
              key={day.id}
              to={`/programme/${day.id}`}
              className={({ isActive }) =>
                clsx(
                  "press relative flex min-h-[7.5rem] flex-col justify-between overflow-hidden rounded-2xl p-3 no-underline hover:no-underline",
                  isActive ? "bg-[#e2c88f] text-[#14152b]" : "bg-white/[0.07] text-white ring-1 ring-white/12",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className="flex items-start justify-between gap-2">
                    <DayBadge day={day} lang={lang} dark={!isActive} className={clsx("w-11", isActive && "ring-[#14152b]/20")} />
                    {isToday(day, now) && status.kind !== "ended" && <TodayPill live={status.kind === "now"} inverted={isActive} />}
                  </span>
                  <span>
                    <span className="block text-[16px] leading-tight font-bold">{pick(day.weekday, lang)}</span>
                    <span className={clsx("mt-0.5 block text-[13px] leading-snug", isActive ? "text-[#14152b]/75" : "text-white/65")}>{pick(day.summary, lang)}</span>
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
      {directions && page.fundraiser.funeral.place && (
        <a
          href={directions}
          target="_blank"
          rel="noreferrer"
          className="press mt-2 flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold text-[#f6efe4]/90 no-underline ring-1 ring-white/10 hover:no-underline active:bg-white/5"
        >
          <Navigation className="size-[18px] text-[#e2c88f]" aria-hidden />
          <span className="flex-1">{tr(`Directions to ${page.fundraiser.funeral.place}`, `Maelekezo ya kufika ${page.fundraiser.funeral.place}`)}</span>
          <ChevronRight className="size-5 opacity-50" aria-hidden />
        </a>
      )}
    </div>
  );
}

function SheetLink({ to, end, icon: Icon, label }: { to: string; end?: boolean; icon: LucideIcon; label: string }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx(
          "flex min-h-13 items-center gap-3 rounded-xl px-3 text-[17px] no-underline hover:no-underline",
          isActive ? "bg-white/10 font-semibold text-white" : "text-[#f6efe4]/85 active:bg-white/5",
        )
      }
    >
      <Icon className="size-5 text-[#e8c27a]" aria-hidden />
      <span className="flex-1">{label}</span>
      <ChevronRight className="size-5 opacity-50" aria-hidden />
    </NavLink>
  );
}

/** Phones: the programme, giving and sharing stay in reach at the bottom of the screen. */
function ActionBar({ page }: { page: PublicPage }) {
  const tr = useTr();
  const lang = useLang();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const inProgramme = pathname.startsWith("/programme");
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-stone-200 bg-white/95 px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
      <Link
        to="/programme"
        aria-current={inProgramme ? "page" : undefined}
        className={clsx(
          "press flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-[15px] font-semibold no-underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-600",
          inProgramme ? "bg-[#0f1027] text-white" : "border border-stone-300 bg-white text-stone-900 active:bg-stone-100",
        )}
      >
        <CalendarDays className="size-[18px]" aria-hidden />
        {tr("Programme", "Ratiba")}
      </Link>
      {page.fundraiser.giving && (
        <BarButton primary onClick={() => navigate("/contribute")} icon={<HandCoins className="size-[18px]" aria-hidden />}>
          {tr("Contribute", "Changia")}
        </BarButton>
      )}
      <button
        type="button"
        onClick={() => void sharePage(page, lang)}
        aria-label={tr("Share this page", "Shiriki ukurasa huu")}
        className="press grid size-11 shrink-0 place-items-center rounded-xl border border-stone-300 bg-white text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-600 active:bg-stone-100"
      >
        <Share2 className="size-5" aria-hidden />
      </button>
    </div>
  );
}

function BarButton({ primary, onClick, icon, children }: { primary?: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "press flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-600",
        primary ? "bg-[#2e2338] text-white active:bg-[#1e1625]" : "border border-stone-300 bg-white text-stone-900 active:bg-stone-100",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
