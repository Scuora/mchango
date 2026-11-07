// The eulogy as the family shares it. Its address, rip-daktari.netlify.app/eulogy,
// is printed as a QR code on the funeral banner.

/** The eulogy text, one string per paragraph, in English and Kiswahili (empty: the booklet is the eulogy). */
export const EULOGY: { en: readonly string[]; sw: readonly string[] } = {
  en: [],
  sw: [],
};

/**
 * The printed eulogy booklet: every page as an image, read down the page, and
 * the whole booklet as one PDF. Both are lightened for phones on a slow network
 * (1240 x 1754 pages); the print master stays with the family.
 */
export const BOOKLET = {
  pages: 36,
  page: (n: number) => `/img/eulogy/page-${String(n).padStart(2, "0")}.jpg`,
  width: 1240,
  height: 1754,
  pdf: "/files/eulogy-booklet-daktari-joseph-karisa-gonzi.pdf",
  pdfSize: { en: "5.9 MB", sw: "MB 5.9" },
} as const;
