// Page addresses listed in a sitemap, on the site's main host (the sitemap lists www, the pages live on the plain name).
export function sitemapUrls(xml: string, origin: string): string[] {
  const host = new URL(origin).host;
  const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1] ?? '').filter((u) => u !== '');
  return [...new Set(urls.map((u) => { try { const x = new URL(u); return `${new URL(origin).protocol}//${host}${x.pathname}`; } catch { return ''; } }).filter((u) => u !== ''))];
}
