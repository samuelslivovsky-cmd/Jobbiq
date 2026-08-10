/**
 * Local crawl runner — runs all connectors from your own machine, free of
 * serverless limits (scraping connectors work here). Writes into whatever
 * DATABASE_URL points at (local Postgres or your production Neon DB).
 *
 * Usage:
 *   pnpm crawl                  # crawl due active preferences
 *   pnpm crawl --force          # ignore frequency gating, crawl everything
 *   pnpm crawl --match          # run AI matching afterwards (needs OPENAI_API_KEY)
 *   pnpm crawl --source=profesia  # only one connector
 *   pnpm crawl --max=200        # max postings per source (default 100)
 */
import path from "path";
import { config as loadEnv } from "dotenv";

// Load repo-root .env no matter where the CLI is invoked from.
loadEnv({ path: path.resolve(__dirname, "../../../.env") });
loadEnv(); // also honor a local .env / already-exported vars

import { prisma } from "@jobbiq/db";
import { connectorRegistry, isConnectorConfigured } from "@jobbiq/connectors";
import { matchUsersForPreferences } from "@jobbiq/matcher";
import { crawlPreferenceSource, isCrawlDue } from "./crawl";

interface Args {
  force: boolean;
  match: boolean;
  source?: string;
  max: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { force: false, match: false, max: 100 };
  for (const arg of argv) {
    if (arg === "--force") args.force = true;
    else if (arg === "--match") args.match = true;
    else if (arg.startsWith("--source=")) args.source = arg.slice(9);
    else if (arg.startsWith("--max=")) args.max = Number(arg.slice(6)) || 100;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.source && !connectorRegistry.has(args.source)) {
    console.error(
      `Unknown source "${args.source}". Available: ${[...connectorRegistry.keys()].join(", ")}`,
    );
    process.exit(1);
  }

  console.log("Connectors:");
  for (const connector of connectorRegistry.values()) {
    const status = isConnectorConfigured(connector)
      ? "ready"
      : `missing env: ${connector.requiredEnv.join(", ")}`;
    console.log(`  ${connector.key.padEnd(16)} ${connector.type.padEnd(7)} ${status}`);
  }

  const preferences = await prisma.searchPreference.findMany({
    where: { active: true },
  });
  if (preferences.length === 0) {
    console.log("\nNo active search preferences — create one in the app first.");
    return;
  }

  let totalFetched = 0;
  const crawledPreferenceIds: string[] = [];

  for (const preference of preferences) {
    if (!args.force && !isCrawlDue(preference)) {
      console.log(`\n[${preference.name}] not due yet (use --force to override)`);
      continue;
    }

    console.log(`\n[${preference.name}] keywords: ${preference.keywords.join(", ")}`);
    const sources = args.source
      ? [args.source]
      : preference.sources.filter((key) => connectorRegistry.has(key));

    for (const sourceKey of sources) {
      const startedAt = Date.now();
      try {
        const result = await crawlPreferenceSource(preference, sourceKey, {
          maxResults: args.max,
        });
        const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
        if (result.skipped) {
          console.log(`  ${sourceKey.padEnd(16)} skipped: ${result.skipped}`);
        } else {
          console.log(`  ${sourceKey.padEnd(16)} ${result.fetched} postings (${seconds}s)`);
          totalFetched += result.fetched;
        }
      } catch (error) {
        console.log(
          `  ${sourceKey.padEnd(16)} FAILED: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    await prisma.searchPreference.update({
      where: { id: preference.id },
      data: { lastCrawledAt: new Date() },
    });
    crawledPreferenceIds.push(preference.id);
  }

  console.log(`\nTotal new/updated postings: ${totalFetched}`);

  if (args.match && crawledPreferenceIds.length > 0) {
    console.log("\nRunning AI matching…");
    const results = await matchUsersForPreferences(crawledPreferenceIds);
    for (const result of results) {
      console.log(
        `  user ${result.userId}: ${result.scored} matches (${result.aiScored} AI-scored)${result.skipped ? ` — ${result.skipped}` : ""}`,
      );
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
