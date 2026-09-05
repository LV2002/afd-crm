import type { MetadataRoute } from "next";

/**
 * Keeps the whole CRM out of every search engine.
 *
 * This system holds students' names, phone numbers, addresses and fee
 * records. Nothing in it belongs in a search index, and "it needs a login
 * anyway" is not the argument it sounds like: `/f/<token>` — the profile
 * form a student fills in themselves — is reachable without one, and a
 * crawled token would sit in an index for anyone to find.
 *
 * `robots.txt` is a request, not a wall. It stops the crawlers that
 * honour it BEFORE they fetch anything; the `noindex` metadata in the
 * root layout and the `X-Robots-Tag` header in `next.config.ts` cover the
 * ones that fetch first and read later.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
