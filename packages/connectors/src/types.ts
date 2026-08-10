import type { NormalizedSearchParams, RawJobPosting } from "@jobbiq/core";

export interface JobConnector {
  /** Stable identifier, e.g. "adzuna", "profesia". */
  key: string;
  name: string;
  type: "api" | "scrape";
  /** Env vars the connector needs; used to decide whether it can run. */
  requiredEnv: string[];
  search(params: NormalizedSearchParams): AsyncIterable<RawJobPosting>;
}

export function isConnectorConfigured(connector: JobConnector): boolean {
  return connector.requiredEnv.every((name) => !!process.env[name]);
}

const USER_AGENT =
  "JobbiqBot/0.1 (personal job aggregation; contact: admin@jobbiq.local)";

/** Minimal polite-fetch helper: identifies the crawler and fails loudly. */
export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status} ${res.statusText}: ${url}`);
  }
  return (await res.json()) as T;
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml",
      "Accept-Language": "sk,cs,en;q=0.8",
    },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status} ${res.statusText}: ${url}`);
  }
  return res.text();
}

/** Politeness delay between page fetches when scraping. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Case-insensitive: does the text mention at least one keyword? */
export function matchesKeywords(text: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const haystack = text.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

/** Strip HTML tags for plain-text descriptions. */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
