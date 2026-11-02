// Netlify serves a plain copy of index.html, so a link shared on WhatsApp would
// show only "Mchango". This puts the real title and link-preview (Open Graph)
// tags into each page, from the backend's GET /api/public/head: the same tags
// the backend adds when it serves the page itself (backend/src/api/page.rs).
// If the backend is slow or down, the page is served unchanged.

interface Context {
  next: () => Promise<Response>;
}

export default async (request: Request, context: Context): Promise<Response> => {
  const response = await context.next();
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) return response;

  let tags: string | null = null;
  try {
    // Same site, so it goes through the /api proxy rule in netlify.toml.
    const head = await fetch(new URL("/api/public/head", request.url), { signal: AbortSignal.timeout(2500) });
    if (head.ok) tags = ((await head.json()) as { tags: string | null }).tags;
  } catch {
    // Without the tags the page still works; shared links just look plainer.
  }
  if (!tags) return response;

  const html = (await response.text()).replace("<title>Mchango</title>", tags);
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-cache");
  return new Response(html, { status: response.status, headers });
};

export const config = {
  path: "/*",
  excludedPath: ["/assets/*", "/api/*", "/manage", "/manage/*", "/favicon.svg"],
};
