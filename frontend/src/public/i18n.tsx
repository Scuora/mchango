// English and Kiswahili for the public site. Each string sits where it is used,
// with both languages side by side: tr("Contributions", "Michango").
//
// The choice is remembered on the device; a `?lang=sw` link opens the site in
// Kiswahili (handy for the Kiswahili WhatsApp messages). Management has no
// provider, so shared components fall back to English there.

import { clsx } from "clsx";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { setTimeLocale } from "@/lib/time";

export type Lang = "en" | "sw";
const STORE = "mchango-lang";

function initialLang(): Lang {
  const param = new URLSearchParams(window.location.search).get("lang");
  if (param === "sw" || param === "en") return param;
  try {
    const saved = localStorage.getItem(STORE);
    if (saved === "sw" || saved === "en") return saved;
  } catch {
    // Storage can be unavailable (private windows); English it is.
  }
  return "en";
}

const LangContext = createContext<{ lang: Lang; setLang: (lang: Lang) => void }>({ lang: "en", setLang: () => undefined });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  // Dates rendered below this point use the chosen language.
  setTimeLocale(lang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => () => setTimeLocale("en"), []);

  function setLang(next: Lang) {
    try {
      localStorage.setItem(STORE, next);
    } catch {
      // Remembered for this visit only.
    }
    // A `?lang=` in the address would win on reload, so keep it in step.
    const url = new URL(window.location.href);
    if (url.searchParams.has("lang")) {
      url.searchParams.set("lang", next);
      window.history.replaceState(window.history.state, "", url);
    }
    setLangState(next);
  }

  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext).lang;
}

/** `tr("English", "Kiswahili")` picks the current language's version. */
export function useTr(): <T>(en: T, sw: T) => T {
  const lang = useLang();
  return (en, sw) => (lang === "sw" ? sw : en);
}

const MONTHS: [string, string][] = [
  ["January", "Januari"],
  ["February", "Februari"],
  ["March", "Machi"],
  ["April", "Aprili"],
  ["May", "Mei"],
  ["June", "Juni"],
  ["July", "Julai"],
  ["August", "Agosti"],
  ["September", "Septemba"],
  ["October", "Oktoba"],
  ["November", "Novemba"],
  ["December", "Desemba"],
  ["Monday", "Jumatatu"],
  ["Tuesday", "Jumanne"],
  ["Wednesday", "Jumatano"],
  ["Thursday", "Alhamisi"],
  ["Friday", "Ijumaa"],
  ["Saturday", "Jumamosi"],
  ["Sunday", "Jumapili"],
];

/** Month and day names in text the family typed (e.g. "Saturday, 7 November 2026"), in Kiswahili. */
export function localiseDates(text: string, lang: Lang): string {
  if (lang !== "sw") return text;
  return MONTHS.reduce((out, [en, sw]) => out.replace(new RegExp(`\\b${en}\\b`, "g"), sw), text);
}

/** The default anonymous label, in Kiswahili; names the family chose stay as they are. */
export function localiseName(name: string, lang: Lang): string {
  return lang === "sw" && name === "Anonymous contributor" ? "Mchangiaji asiyetajwa" : name;
}

/** A link to a public page that opens in the current language. */
export function langPath(path: string, lang: Lang): string {
  return lang === "sw" ? `${path}${path.includes("?") ? "&" : "?"}lang=sw` : path;
}

/** English | Kiswahili, as a small switch: short codes, or full names with `full`; `compact` for the phone's top bar. `dark` for the plum navbar. */
export function LangToggle({ className, dark = true, full = false, compact = false }: { className?: string; dark?: boolean; full?: boolean; compact?: boolean }) {
  const { lang, setLang } = useContext(LangContext);
  return (
    <div
      role="radiogroup"
      aria-label="Language / Lugha"
      className={clsx("inline-flex rounded-full p-0.5 text-[13px] font-semibold", dark ? "bg-white/[0.07] ring-1 ring-white/15" : "bg-stone-100 ring-1 ring-stone-200", className)}
    >
      {(
        [
          ["en", "EN", "English"],
          ["sw", "SW", "Kiswahili"],
        ] as const
      ).map(([value, short, name]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={lang === value}
          title={name}
          onClick={() => setLang(value)}
          className={clsx(
            "cursor-pointer rounded-full tracking-wide transition-colors",
            compact ? "min-h-8 px-2.5 text-[12px]" : "min-h-8 px-3",
            lang === value
              ? dark
                ? "bg-[#f7f3ea] text-[#0b0a09]"
                : "bg-white text-stone-900 shadow-sm"
              : dark
                ? "text-[#f7f3ea]/75 hover:text-white"
                : "text-stone-600 hover:text-stone-900",
          )}
        >
          {full ? name : short}
        </button>
      ))}
    </div>
  );
}
