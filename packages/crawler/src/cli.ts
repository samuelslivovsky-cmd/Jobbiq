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
 *   pnpm crawl --max=200        # max postings per source and country (default 100)
 *   pnpm crawl --country=sk,cz  # override the preferences' countries
 *   pnpm crawl --list           # list connectors with their countries and exit
 *
 * Browser connectors (type "browser": AMS, StepStone.at) need Chromium once:
 *   pnpm exec playwright install chromium
 */
import path from "path";
import { config as loadEnv } from "dotenv";

// Load repo-root .env no matter where the CLI is invoked from.
loadEnv({ path: path.resolve(__dirname, "../../../.env") });
loadEnv(); // also honor a local .env / already-exported vars

import { prisma } from "@jobbiq/db";
import { closeBrowser, connectorRegistry, isConnectorConfigured } from "@jobbiq/connectors";
import { isCountryCode } from "@jobbiq/core";
import { matchUsersForPreferences } from "@jobbiq/matcher";
import { crawlPreference, isCrawlDue } from "./crawl";

interface Args {
  force: boolean;
  match: boolean;
  source?: string;
  countries?: string[];
  list: boolean;
  max: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { force: false, match: false, list: false, max: 100 };
  for (const arg of argv) {
    if (arg === "--force") args.force = true;
    else if (arg === "--match") args.match = true;
    else if (arg.startsWith("--source=")) args.source = arg.slice(9);
    else if (arg.startsWith("--max=")) args.max = Number(arg.slice(6)) || 100;
    else if (arg === "--list") args.list = true;
    else if (arg.startsWith("--country=")) {
      args.countries = arg.slice(10).toLowerCase().split(",").filter(Boolean);
    }
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

  const invalidCountry = args.countries?.find((c) => !isCountryCode(c));
  if (invalidCountry) {
    console.error(`Unknown country "${invalidCountry}". Use: sk, cz, hu, pl, de, at`);
    process.exit(1);
  }

  console.log("Connectors:");
  for (const connector of connectorRegistry.values()) {
    const status = isConnectorConfigured(connector)
      ? "ready"
      : `missing env: ${connector.requiredEnv.join(", ")}`;
    const countries = connector.countries?.join(",") ?? "intl/remote";
    console.log(
      `  ${connector.key.padEnd(18)} ${connector.type.padEnd(7)} ${countries.padEnd(18)} ${status}`,
    );
  }
  if (args.list) return;

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

    const effective = args.countries
      ? { ...preference, countries: args.countries }
      : preference;

    const results = await crawlPreference(effective, {
      maxResults: args.max,
      sources,
    });
    for (const result of results) {
      const name = result.sourceKey.padEnd(20);
      const seconds = ((result.durationMs ?? 0) / 1000).toFixed(1);
      if (result.failed) {
        console.log(`  ${name} FAILED (${seconds}s): ${result.failed}`);
      } else if (result.skipped) {
        console.log(`  ${name} skipped: ${result.skipped}`);
      } else {
        console.log(`  ${name} ${result.fetched} postings (${seconds}s)`);
        totalFetched += result.fetched;
      }
      for (const error of result.errors ?? []) {
        console.log(`  ${"".padEnd(20)} ! ${error}`);
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
  .finally(async () => {
    await closeBrowser(); // headless Chromium of browser connectors, if started
    await prisma.$disconnect();
  });
