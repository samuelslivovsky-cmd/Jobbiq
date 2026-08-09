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

/** Minimal polite-fetch helper: identifies the crawler and fails loudly. */
export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "JobbiqBot/0.1 (job aggregation; contact: admin@jobbiq.local)",
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status} ${res.statusText}: ${url}`);
  }
  return (await res.json()) as T;
}
