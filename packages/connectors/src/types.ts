import { foldText, type CountryCode, type NormalizedSearchParams, type RawJobPosting } from "@jobbiq/core";

export interface JobConnector {
  /** Stable identifier, e.g. "adzuna", "profesia". */
  key: string;
  name: string;
  type: "api" | "scrape";
  /** Env vars the connector needs; used to decide whether it can run. */
  requiredEnv: string[];
  /**
   * Markets the source covers. The crawler calls search() once per selected
   * country with `params.country` set. Omit for international / remote-only
   * sources, which run once with `country: null`.
   */
  countries?: CountryCode[];
  /** Public site, shown in the UI. */
  homepage?: string;
  /**
   * Bulk downloads too large for a serverless function — skipped on Vercel,
   * run them with the local crawler (`pnpm crawl`).
   */
  heavy?: boolean;
  search(params: NormalizedSearchParams): AsyncIterable<RawJobPosting>;
}

export function isConnectorConfigured(connector: JobConnector): boolean {
  return connector.requiredEnv.every((name) => !!process.env[name]);
}

/** Heavy connectors don't run inside Vercel functions. */
export function canRunHere(connector: JobConnector): boolean {
  return !(connector.heavy && process.env.VERCEL);
}

export { fetchJson, fetchText, politeFetch, sleep, isAllowedByRobots, RobotsDisallowedError, HttpError, USER_AGENT } from "./http";

/** Case-insensitive: does the text mention at least one keyword? */
export function matchesKeywords(text: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const haystack = foldText(text);
  return keywords.some((keyword) => haystack.includes(foldText(keyword)));
}

/** Decode the HTML entities that commonly survive in feeds. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Collapse whitespace runs (scraped text is full of indentation). */
export function cleanText(text: string | undefined | null): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** Absolute URL from a possibly relative href. */
export function absoluteUrl(href: string, base: string): string {
  return new URL(href, base).toString();
}

/** Strip HTML tags for plain-text descriptions. */
export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const memoStore = new Map<string, { at: number; value: Promise<unknown> }>();

/**
 * Process-level cache for bulk downloads (sitemaps, open-data dumps, page
 * scans) so several preferences in one crawl run reuse a single fetch.
 */
export function memoize<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = memoStore.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load();
  memoStore.set(key, { at: Date.now(), value });
  value.catch(() => memoStore.delete(key));
  return value;
}

/** Remote-work hint in free text across our six languages + English. */
export function looksRemote(text: string): boolean {
  return /\b(remote|home\s*office|homeoffice|z domu|práca z domu|práce z domova|zdaln|távmunka|otthonról|mobiles arbeiten|fully remote)\b/i.test(
    text,
  );
}

/** Client-side location filter: no locations, unknown location or remote → keep. */
export function matchesLocation(
  posting: { location: string | null; remoteType: string | null },
  locations: string[],
): boolean {
  if (locations.length === 0 || !posting.location || posting.remoteType === "REMOTE") return true;
  return matchesKeywords(posting.location, locations);
}
