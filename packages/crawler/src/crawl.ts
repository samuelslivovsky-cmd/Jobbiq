import { prisma, type SearchPreference, type CrawlFrequency } from "@jobbiq/db";
import { canRunHere, getConnector, isConnectorConfigured } from "@jobbiq/connectors";
import {
  effectiveCountries,
  jobContentHash,
  locationsForCountry,
  normalizedSearchParamsSchema,
  type CountryCode,
  type RawJobPosting,
} from "@jobbiq/core";

const FREQUENCY_MS: Record<CrawlFrequency, number> = {
  HOURLY: 60 * 60 * 1000,
  EVERY_6_HOURS: 6 * 60 * 60 * 1000,
  DAILY: 24 * 60 * 60 * 1000,
  WEEKLY: 7 * 24 * 60 * 60 * 1000,
};

export function isCrawlDue(preference: SearchPreference, now = new Date()): boolean {
  if (!preference.lastCrawledAt) return true;
  return (
    now.getTime() - preference.lastCrawledAt.getTime() >=
    FREQUENCY_MS[preference.frequency]
  );
}

async function upsertPosting(
  sourceId: string,
  raw: RawJobPosting,
  fallbackCountry: CountryCode | null,
) {
  const country = raw.country ?? fallbackCountry;
  const contentHash = jobContentHash({
    title: raw.title,
    company: raw.company,
    location: raw.location,
  });

  await prisma.jobPosting.upsert({
    where: {
      sourceId_externalId: { sourceId, externalId: raw.externalId },
    },
    create: {
      sourceId,
      externalId: raw.externalId,
      url: raw.url,
      title: raw.title,
      company: raw.company,
      location: raw.location,
      country,
      remoteType: raw.remoteType,
      salaryText: raw.salaryText,
      description: raw.description,
      applyEmail: raw.applyEmail,
      applyUrl: raw.applyUrl,
      postedAt: raw.postedAt,
      contentHash,
    },
    update: {
      url: raw.url,
      country,
      salaryText: raw.salaryText,
      description: raw.description,
      fetchedAt: new Date(),
    },
  });
}

export interface CrawlResult {
  preferenceId: string;
  sourceKey: string;
  fetched: number;
  skipped?: string;
  /** Per-country failures that didn't abort the whole source. */
  errors?: string[];
  /** The whole source failed (every country run errored). */
  failed?: string;
  durationMs?: number;
}

/** Countries a connector should run for under a given preference. */
export function connectorRunCountries(
  connectorCountries: CountryCode[] | undefined,
  preferenceCountries: string[],
): (CountryCode | null)[] {
  if (!connectorCountries) return [null];
  const wanted = effectiveCountries(preferenceCountries);
  return connectorCountries.filter((country) => wanted.includes(country));
}

/**
 * Run one connector for one search preference and persist the postings.
 * Country-aware connectors run once per selected country they cover;
 * `maxResults` applies per country.
 */
export async function crawlPreferenceSource(
  preference: SearchPreference,
  sourceKey: string,
  options?: { maxResults?: number },
): Promise<CrawlResult> {
  const connector = getConnector(sourceKey);
  const base = { preferenceId: preference.id, sourceKey };
  if (!isConnectorConfigured(connector)) {
    return { ...base, fetched: 0, skipped: "missing required env vars" };
  }
  if (!canRunHere(connector)) {
    return { ...base, fetched: 0, skipped: "bulk source — runs only via the local crawler" };
  }

  const runCountries = connectorRunCountries(connector.countries, preference.countries);
  if (runCountries.length === 0) {
    return { ...base, fetched: 0, skipped: "no selected country covered" };
  }

  const source = await prisma.jobSource.upsert({
    where: { key: connector.key },
    create: {
      key: connector.key,
      name: connector.name,
      type: connector.type === "api" ? "API" : "SCRAPE",
      baseUrl: connector.homepage ?? "",
    },
    update: connector.homepage ? { baseUrl: connector.homepage, name: connector.name } : {},
  });

  let fetched = 0;
  const errors: string[] = [];
  for (const country of runCountries) {
    const params = normalizedSearchParamsSchema.parse({
      keywords: preference.keywords,
      locations: country
        ? locationsForCountry(preference.locations, country)
        : preference.locations,
      remoteType: preference.remoteType,
      salaryMin: preference.salaryMin,
      country,
      maxResults: options?.maxResults ?? 100,
    });

    try {
      for await (const raw of connector.search(params)) {
        await upsertPosting(source.id, raw, country);
        fetched++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(country ? `${country}: ${message}` : message);
    }
  }

  if (fetched === 0 && errors.length > 0) {
    throw new Error(errors.join("; "));
  }
  return { ...base, fetched, ...(errors.length > 0 ? { errors } : {}) };
}

/** Run async tasks with at most `limit` in flight, preserving result order. */
async function pool<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Crawl all (or the given) sources of one preference. Sources hit different
 * hosts and politeness is enforced per host, so they run concurrently.
 */
export async function crawlPreference(
  preference: SearchPreference,
  options?: { maxResults?: number; sources?: string[]; concurrency?: number },
): Promise<CrawlResult[]> {
  const sources = options?.sources ?? preference.sources;
  return pool(sources, options?.concurrency ?? 6, async (sourceKey) => {
    const startedAt = Date.now();
    try {
      const result = await crawlPreferenceSource(preference, sourceKey, options);
      return { ...result, durationMs: Date.now() - startedAt };
    } catch (error) {
      return {
        preferenceId: preference.id,
        sourceKey,
        fetched: 0,
        failed: error instanceof Error ? error.message : "unknown error",
        durationMs: Date.now() - startedAt,
      };
    }
  });
}

/**
 * Crawl every active preference whose frequency makes it due, across all its
 * configured sources. Designed to be invoked from a scheduled (cron) function.
 */
export async function crawlDuePreferences(options?: {
  maxResults?: number;
}): Promise<CrawlResult[]> {
  const preferences = await prisma.searchPreference.findMany({
    where: { active: true },
  });

  const results: CrawlResult[] = [];
  for (const preference of preferences) {
    if (!isCrawlDue(preference)) continue;
    results.push(...(await crawlPreference(preference, options)));
    await prisma.searchPreference.update({
      where: { id: preference.id },
      data: { lastCrawledAt: new Date() },
    });
  }
  return results;
}
