import { Queue } from "bullmq";
import IORedis from "ioredis";

export const connection = new IORedis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  { maxRetriesPerRequest: null },
);

export interface CrawlJobData {
  /** Connector key, e.g. "adzuna". */
  sourceKey: string;
  /** SearchPreference id whose params drive this crawl. */
  preferenceId: string;
}

export const crawlQueue = new Queue<CrawlJobData>("crawl", { connection });
