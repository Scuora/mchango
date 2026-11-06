// The family's name for messages: "the family of Karisa Gonzi" from the memorial name.
// (The fundraiser no longer reports a goal, what is still needed or pledges not yet in.)

/** Titles before a name, which are not part of the family's name. */
const TITLE = /^(dr|dkt|daktari|prof|mzee|mr|mrs|ms|rev|hon|eng|sir|bishop|pastor)\.?$/i;

/** "the family of Karisa Gonzi" (or "familia ya Karisa Gonzi") from "Daktari Joseph Karisa Gonzi": the name without the title and given name. */
export function familyOf(memorialName: string | null | undefined, lang: "en" | "sw" = "en"): string {
  const words = (memorialName ?? "").trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && TITLE.test(words[0])) words.shift();
  if (words.length === 0) return lang === "sw" ? "familia" : "the family";
  const surname = (words.length >= 3 ? words.slice(1) : words).join(" ");
  return lang === "sw" ? `familia ya ${surname}` : `the family of ${surname}`;
}

