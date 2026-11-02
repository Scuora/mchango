// Sharing the public page: the phone's share sheet when there is one,
// otherwise WhatsApp. Uses public page data only.

import type { PublicPage } from "@/lib/types";

export function publicLink(path = "/"): string {
  return `${window.location.origin}${path}`;
}

export function shareText(page: PublicPage): string {
  const f = page.fundraiser;
  const lines: string[] = [];
  if (f.memorial_name) {
    lines.push(`In loving memory of ${f.memorial_name}${f.memorial_dates ? ` (${f.memorial_dates})` : ""}.`);
  } else {
    lines.push(f.name);
  }
  if (f.giving) {
    const g = f.giving;
    const how =
      g.method === "paybill"
        ? `Paybill ${g.number}, account ${g.account ?? ""}`
        : g.method === "till"
          ? `Till number ${g.number}`
          : `Send money to ${g.number}`;
    lines.push(`To contribute through M-Pesa: ${how} (${g.name}).`);
  }
  lines.push(`Every contribution and expense is listed here: ${publicLink()}`);
  return lines.join("\n");
}

export async function sharePage(page: PublicPage): Promise<void> {
  const text = shareText(page);
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
