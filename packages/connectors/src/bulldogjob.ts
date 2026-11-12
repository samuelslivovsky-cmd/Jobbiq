import * as cheerio from "cheerio";
import type { NormalizedSearchParams, RawJobPosting } from "@jobbiq/core";
import type { JobConnector } from "./types";
import { cleanText, fetchText, looksRemote, matchesKeywords, matchesLocation, memoize } from "./types";

/**
 * Bulldogjob.pl — Polish IT board. /companies/jobs listing pages are
 * robots-allowed and embed their results in __NEXT_DATA__
 * (props.pageProps.jobs, 50 per page). No keyword URL → scan + filter locally.
 */
const BASE = "https://bulldogjob.pl";
const SCAN_PAGES = 12;

export interface BulldogJob {
  id?: string | number;
  position?: string;
  title?: string;
  company?: { name?: string } | string;
  city?: string;
  cities?: string[];
  locations?: Array<{ city?: string; location?: { city?: string } }> | string[];
  remote?: boolean;
  experienceLevel?: string;
  technologyTags?: string[];
  mainTechnology?: string;
  denominatedSalaryLong?: { money?: string; currency?: string; hidden?: boolean };
  salary?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function parseNextData(html: string): unknown {
  const $ = cheerio.load(html);
  const raw = $("script#__NEXT_DATA__").contents().text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function bulldogJobsFromHtml(html: string): BulldogJob[] {
  const data = parseNextData(html) as { props?: { pageProps?: { jobs?: unknown } } } | null;
  const jobs = data?.props?.pageProps?.jobs;
  return Array.isArray(jobs) ? (jobs as BulldogJob[]) : [];
}

export function mapBulldogJob(job: BulldogJob): RawJobPosting | null {
  const title = cleanText(job.position ?? job.title);
  if (job.id === undefined || !title) return null;
  const id = String(job.id);
  const url = `${BASE}/companies/jobs/${id}`;
  const company = typeof job.company === "string" ? job.company : job.company?.name;
  const cities = [
    job.city,
    ...(job.cities ?? []),
    ...(job.locations ?? []).map((l) => (typeof l === "string" ? l : l.city ?? l.location?.city)),
  ]
    .map((c) => cleanText(c))
    .filter(Boolean);
  const salary = job.denominatedSalaryLong;
  const tags = [job.mainTechnology, ...(job.technologyTags ?? []), job.experienceLevel].filter(Boolean);
  const date = job.updatedAt ?? job.createdAt;

  return {
    sourceKey: "bulldogjob",
    externalId: id,
    url,
    title,
    company: cleanText(company) || "Unknown",
    location: [...new Set(cities)].join(", ") || null,
    remoteType: job.remote || looksRemote(cities.join(" ")) ? "REMOTE" : null,
    salaryText:
      salary && !salary.hidden && salary.money ? `${salary.money} ${salary.currency ?? ""}`.trim() : job.salary ?? null,
    description: [title, ...tags].join(" · "),
    applyEmail: null,
    applyUrl: url,
    postedAt: date ? new Date(date) : null,
    country: "pl",
  };
}

async function scanBulldog(): Promise<RawJobPosting[]> {
  const all: RawJobPosting[] = [];
  for (let page = 1; page <= SCAN_PAGES; page++) {
    const html = await fetchText(`${BASE}/companies/jobs/s/page,${page}`, { minIntervalMs: 2000 });
    const jobs = bulldogJobsFromHtml(html);
    for (const job of jobs) {
      const posting = mapBulldogJob(job);
      if (posting) all.push(posting);
    }
    if (jobs.length < 50) break;
  }
  return all;
}

export const bulldogjobConnector: JobConnector = {
  key: "bulldogjob",
  name: "Bulldogjob.pl",
  type: "scrape",
  requiredEnv: [],
  countries: ["pl"],
  homepage: `${BASE}/`,

  async *search(params: NormalizedSearchParams): AsyncIterable<RawJobPosting> {
    const postings = await memoize("bulldogjob", 30 * 60_000, scanBulldog);
    let fetched = 0;
    for (const posting of postings) {
      if (!matchesKeywords(posting.description, params.keywords)) continue;
      if (!matchesLocation(posting, params.locations)) continue;
      yield posting;
      if (++fetched >= params.maxResults) return;
    }
  },
};
