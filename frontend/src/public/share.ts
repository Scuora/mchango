// Sharing the public page: the phone's share sheet when there is one,
// otherwise WhatsApp. Uses public page data only.

import type { PublicPage } from "@/lib/types";
import { langPath, localiseDates, type Lang } from "./i18n";

export function publicLink(path = "/"): string {
  return `${window.location.origin}${path}`;
}

export function shareText(page: PublicPage, lang: Lang = "en"): string {
  const f = page.fundraiser;
  const sw = lang === "sw";
  const lines: string[] = [];
  if (f.memorial_name) {
    const dates = f.memorial_dates ? ` (${localiseDates(f.memorial_dates, lang)})` : "";
    lines.push(sw ? `Kwa kumbukumbu ya ${f.memorial_name}${dates}.` : `In loving memory of ${f.memorial_name}${dates}.`);
  } else {
    lines.push(f.name);
  }
  if (f.giving) {
    const g = f.giving;
    const how =
      g.method === "paybill"
        ? sw
          ? `Paybill ${g.number}, akaunti ${g.account ?? ""}`
          : `Paybill ${g.number}, account ${g.account ?? ""}`
        : g.method === "till"
          ? sw
            ? `Namba ya till ${g.number}`
            : `Till number ${g.number}`
          : sw
            ? `Tuma pesa kwa ${g.number}`
            : `Send money to ${g.number}`;
    lines.push(sw ? `Kuchangia kupitia M-Pesa: ${how} (${g.name}).` : `To contribute through M-Pesa: ${how} (${g.name}).`);
  }
  const link = publicLink(langPath("/", lang));
  lines.push(sw ? `Kila mchango na matumizi yameorodheshwa hapa: ${link}` : `Every contribution and expense is listed here: ${link}`);
  return lines.join("\n");
}

export async function sharePage(page: PublicPage, lang: Lang = "en"): Promise<void> {
  const text = shareText(page, lang);
  const title = page.fundraiser.memorial_name ?? page.fundraiser.name;
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}

/** Copies text, falling back to a hidden textarea where the Clipboard API is unavailable. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  return ok;
}
