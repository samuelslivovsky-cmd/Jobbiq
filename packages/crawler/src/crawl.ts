import { prisma, type SearchPreference, type CrawlFrequency } from "@jobbiq/db";
import { getConnector, isConnectorConfigured } from "@jobbiq/connectors";
import {
  jobContentHash,
  normalizedSearchParamsSchema,
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

async function upsertPosting(sourceId: string, raw: RawJobPosting) {
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
}

/** Run one connector for one search preference and persist the postings. */
export async function crawlPreferenceSource(
  preference: SearchPreference,
  sourceKey: string,
  options?: { maxResults?: number },
): Promise<CrawlResult> {
  const connector = getConnector(sourceKey);
  if (!isConnectorConfigured(connector)) {
    return {
      preferenceId: preference.id,
      sourceKey,
      fetched: 0,
      skipped: "missing required env vars",
    };
  }

  const source = await prisma.jobSource.upsert({
    where: { key: connector.key },
    create: {
      key: connector.key,
      name: connector.name,
      type: connector.type === "api" ? "API" : "SCRAPE",
      baseUrl: "",
    },
    update: {},
  });

  const params = normalizedSearchParamsSchema.parse({
    keywords: preference.keywords,
    locations: preference.locations,
    remoteType: preference.remoteType,
    salaryMin: preference.salaryMin,
    country: null,
    maxResults: options?.maxResults ?? 100,
  });

  let fetched = 0;
  for await (const raw of connector.search(params)) {
    await upsertPosting(source.id, raw);
    fetched++;
  }
  return { preferenceId: preference.id, sourceKey, fetched };
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

    for (const sourceKey of preference.sources) {
      try {
        results.push(await crawlPreferenceSource(preference, sourceKey, options));
      } catch (error) {
        results.push({
          preferenceId: preference.id,
          sourceKey,
          fetched: 0,
          skipped: error instanceof Error ? error.message : "unknown error",
        });
      }
    }

    await prisma.searchPreference.update({
      where: { id: preference.id },
      data: { lastCrawledAt: new Date() },
    });
  }
  return results;
}
