import { Worker } from "bullmq";
import { prisma } from "@jobbiq/db";
import { getConnector, isConnectorConfigured } from "@jobbiq/connectors";
import {
  jobContentHash,
  normalizedSearchParamsSchema,
  type RawJobPosting,
} from "@jobbiq/core";
import { connection, type CrawlJobData } from "./queues";

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

export function startCrawlWorker() {
  return new Worker<CrawlJobData>(
    "crawl",
    async (job) => {
      const { sourceKey, preferenceId } = job.data;
      const connector = getConnector(sourceKey);
      if (!isConnectorConfigured(connector)) {
        throw new Error(`Connector ${sourceKey} is missing required env vars`);
      }

      const preference = await prisma.searchPreference.findUniqueOrThrow({
        where: { id: preferenceId },
      });

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
        maxResults: 100,
      });

      let count = 0;
      for await (const raw of connector.search(params)) {
        await upsertPosting(source.id, raw);
        count++;
      }
      return { fetched: count };
    },
    { connection, concurrency: 2 },
  );
}
