import * as cheerio from "cheerio";
import type { CountryCode, NormalizedSearchParams, RawJobPosting } from "@jobbiq/core";
import type { JobConnector } from "./types";
import { cleanText, fetchText, looksRemote, matchesKeywords, matchesLocation, memoize } from "./types";
import { extractJsonLdJobPostings, jsonLdToPosting, parseSitemap, slugText, type SitemapEntry } from "./structured";

interface SitemapBoardSpec {
  key: string;
  name: string;
  countries: CountryCode[];
  homepage: string;
  sitemapUrl: string;
  /** Detail URLs; capture group 1 = external ID. */
  detailPattern: RegExp;
  /** Fixed country of every ad, or null to read it from JSON-LD. */
  country: CountryCode | null;
  minIntervalMs?: number;
}

/** Fallback when a detail page has no JSON-LD: OpenGraph / <h1> / meta. */
export function parseDetailMeta(
  html: string,
  base: { sourceKey: string; externalId: string; url: string; country: string | null },
): RawJobPosting | null {
  const $ = cheerio.load(html);
  const title = cleanText($("h1").first().text() || $('meta[property="og:title"]').attr("content"));
  if (!title) return null;
  const description = cleanText(
    $('meta[name="description"]').attr("content") ?? $('meta[property="og:description"]').attr("content"),
  );
  return {
    sourceKey: base.sourceKey,
    externalId: base.externalId,
    url: base.url,
    title,
    company: "Unknown",
    location: null,
    remoteType: looksRemote(`${title} ${description}`) ? "REMOTE" : null,
    salaryText: null,
    description: description || title,
    applyEmail: null,
    applyUrl: base.url,
    postedAt: null,
    country: base.country,
  };
}

async function loadSitemap(url: string): Promise<SitemapEntry[]> {
  const entries = parseSitemap(await fetchText(url));
  const children = entries.filter((e) => /\.xml(\.gz)?(\?|$)/.test(e.loc));
  if (children.length === 0) return entries;
  // Sitemap index → read child sitemaps (bounded).
  const all: SitemapEntry[] = [];
  for (const child of children.slice(0, 10)) {
    all.push(...parseSitemap(await fetchText(child.loc)));
  }
  return all;
}

/**
 * Board without usable server-side search: read the sitemap of live ads,
 * pre-filter by keywords in the URL slug, then fetch only matching detail
 * pages (newest first) and parse their JSON-LD JobPosting.
 */
export function sitemapBoardConnector(spec: SitemapBoardSpec): JobConnector {
  return {
    key: spec.key,
    name: spec.name,
    type: "scrape",
    requiredEnv: [],
    countries: spec.countries,
    homepage: spec.homepage,
    // One request per ad → too slow for a serverless function.
    heavy: true,

    async *search(params: NormalizedSearchParams): AsyncIterable<RawJobPosting> {
      const entries = await memoize(`sitemap:${spec.sitemapUrl}`, 60 * 60_000, () =>
        loadSitemap(spec.sitemapUrl),
      );
      const candidates = entries
        .filter((e) => spec.detailPattern.test(e.loc))
        .filter((e) => matchesKeywords(slugText(e.loc), params.keywords))
        .sort((a, b) => (b.lastmod?.getTime() ?? 0) - (a.lastmod?.getTime() ?? 0));

      let fetched = 0;
      // Cap detail fetches: keyword-in-slug is a coarse filter.
      for (const entry of candidates.slice(0, Math.min(params.maxResults * 2, 150))) {
        const externalId = entry.loc.match(spec.detailPattern)?.[1] ?? entry.loc;
        const base = { sourceKey: spec.key, externalId, url: entry.loc, country: spec.country };
        let html: string;
        try {
          // Memoized: multi-country boards would otherwise refetch per country run.
          html = await memoize(`detail:${entry.loc}`, 60 * 60_000, () =>
            fetchText(entry.loc, { minIntervalMs: spec.minIntervalMs ?? 1500 }),
          );
        } catch {
          continue; // expired ad / transient error — skip this one
        }
        const [job] = extractJsonLdJobPostings(html);
        const posting = job ? jsonLdToPosting(job, base) : parseDetailMeta(html, base);
        if (!posting) continue;
        // Multi-country board: keep each ad in its own country's run.
        if (posting.country && params.country && posting.country !== params.country) continue;
        if (!posting.postedAt && entry.lastmod) posting.postedAt = entry.lastmod;
        if (!matchesLocation(posting, params.locations)) continue;
        yield posting;
        if (++fetched >= params.maxResults) return;
      }
    },
  };
}

/** JustJoin.it — the main Polish IT board. Its /api/ is robots-disallowed;
 * the live-offers sitemap and offer pages are allowed. */
export const justjoinConnector = sitemapBoardConnector({
  key: "justjoin",
  name: "JustJoin.it",
  countries: ["pl"],
  homepage: "https://justjoin.it/",
  sitemapUrl: "https://justjoin.it/sitemaps/active-jobs.xml",
  detailPattern: /\/job-offer\/([^/?#]+)/,
  country: "pl",
});

/** RocketJobs.pl — non-IT sister board of JustJoin.it (same platform). */
export const rocketjobsConnector = sitemapBoardConnector({
  key: "rocketjobs",
  name: "RocketJobs.pl",
  countries: ["pl"],
  homepage: "https://rocketjobs.pl/",
  sitemapUrl: "https://rocketjobs.pl/sitemaps/active-jobs.xml",
  detailPattern: /\/oferta-pracy\/([^/?#]+)/,
  country: "pl",
});

/** StartupJobs.cz — startup roles in CZ and SK; offers sitemap + JSON-LD. */
export const startupjobsConnector = sitemapBoardConnector({
  key: "startupjobs",
  name: "StartupJobs",
  countries: ["cz", "sk"],
  homepage: "https://www.startupjobs.cz/",
  sitemapUrl: "https://www.startupjobs.cz/sitemap/offers.xml",
  detailPattern: /\/nabidka\/(\d+)/,
  country: null,
});
