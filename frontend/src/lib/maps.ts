// Map links for the place of burial. Google Maps links carry the pin's
// coordinates in a few shapes; when they do, visitors also get a "Get
// directions" link that starts from where they are.

export interface Coordinates {
  lat: number;
  lng: number;
}

const PAIR = /(-?\d{1,2}\.\d+)\s*,\s*\+?(-?\d{1,3}\.\d+)/;

/** The pin in links like `…?query=-3.53,39.50`, `…/search/-3.53,+39.50`, `…@-3.53,39.50` or `…destination=…`. */
export function coordinatesIn(url: string | null | undefined): Coordinates | null {
  if (!url) return null;
  let text = url;
  try {
    text = decodeURIComponent(url);
  } catch {
    // Keep the raw link.
  }
  const match = PAIR.exec(text);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

/** Turn-by-turn directions from the visitor's location to the pin. */
export function directionsLink({ lat, lng }: Coordinates): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
