import type { CountryCode, NormalizedSearchParams, RawJobPosting } from "@jobbiq/core";
import type { JobConnector } from "./types";
import { cleanText, looksRemote, matchesKeywords, matchesLocation } from "./types";
import { browserFetch, type BrowserPage } from "./browser";
import { parseLinkCards } from "./cards";
import { findOfferArray, pickText, type Json } from "./jsonShape";

interface BrowserBoardSpec {
  key: string;
  name: string;
  countries: CountryCode[];
  homepage: string;
  locale: string;
  pageUrl(params: NormalizedSearchParams, page: number): string;
  waitForSelector?: string;
  captureJson?: RegExp;
  /** Postings from a rendered page (JSON captures first, DOM as fallback). */
  parse(page: BrowserPage, params: NormalizedSearchParams): RawJobPosting[];
  maxPages?: number;
}

/** Paginated JS-rendered listing → connector. Local only (heavy). */
export function browserBoardConnector(spec: BrowserBoardSpec): JobConnector {
  return {
    key: spec.key,
    name: spec.name,
    type: "browser",
    requiredEnv: [],
    countries: spec.countries,
    homepage: spec.homepage,
    heavy: true,

    async *search(params) {
      const seen = new Set<string>();
      let fetched = 0;
      for (let pageNr = 1; pageNr <= (spec.maxPages ?? 4); pageNr++) {
        const page = await browserFetch(spec.pageUrl(params, pageNr), {
          locale: spec.locale,
          waitForSelector: spec.waitForSelector,
          captureJson: spec.captureJson,
        });
        const fresh = spec.parse(page, params).filter((p) => !seen.has(p.externalId));
        if (fresh.length === 0) return;

        for (const posting of fresh) {
          seen.add(posting.externalId);
          // Guard in case the site ignored our query.
          if (!matchesKeywords(`${posting.title} ${posting.description}`, params.keywords)) continue;
          if (!matchesLocation(posting, params.locations)) continue;
          yield posting;
          if (++fetched >= params.maxResults) return;
        }
      }
    },
  };
}

// ---------- AMS alle jobs (Austria) ----------

const AMS = "https://jobs.ams.at";

/** Map one job object from AMS's own (undocumented) search API response. */
export function mapAmsJob(job: Json): RawJobPosting | null {
  const id = pickText(job, "id", "jobId", "stellenId", "referenznummer", "uuid");
  const title = cleanText(pickText(job, "title", "titel", "bezeichnung", "jobTitle", "berufsbezeichnung"));
  if (!id || !title) return null;
  const url = `${AMS}/public/emps/job/${encodeURIComponent(id)}`;
  const description = cleanText(pickText(job, "description", "beschreibung", "text", "teaser"));
  const company = cleanText(pickText(job, "company", "companyName", "arbeitgeber", "unternehmen", "firma"));
  const location = cleanText(pickText(job, "location", "arbeitsort", "ort", "workplace", "locations"));
  // Filter facets (regions, categories) also have id + name — a job has more.
  if (!company && !location) return null;
  const dateRaw = pickText(job, "publishedAt", "datePosted", "veroeffentlichtAm", "erstelltAm", "date");
  const date = dateRaw ? new Date(dateRaw) : null;
  return {
    sourceKey: "ams",
    externalId: id,
    url,
    title,
    company: company || "Unknown",
    location: location || null,
    remoteType: looksRemote(`${title} ${description}`) ? "REMOTE" : null,
    salaryText: cleanText(pickText(job, "salary", "gehalt", "entgelt")) || null,
    description: description || title,
    applyEmail: null,
    applyUrl: url,
    postedAt: date && !Number.isNaN(date.getTime()) ? date : null,
    country: "at",
  };
}

/**
 * AMS alle jobs — the Austrian public employment service's job search
 * (largest AT database). Its API requests are signed by the Angular front
 * end, so a real browser renders the page; we read the JSON the page itself
 * loads (when robots-allowed) and fall back to the rendered job links.
 */
export const amsConnector = browserBoardConnector({
  key: "ams",
  name: "AMS alle jobs",
  countries: ["at"],
  homepage: `${AMS}/public/emps/`,
  locale: "de-AT",
  captureJson: /jobs\.ams\.at\/.*api/i,
  waitForSelector: "a[href*='/public/emps/job/']",
  pageUrl: (params, page) => {
    const query = new URLSearchParams({ query: params.keywords.join(" ") });
    if (params.locations[0]) query.set("location", params.locations[0]);
    if (page > 1) query.set("page", String(page));
    return `${AMS}/public/emps/jobs?${query}`;
  },
  parse: (page) => {
    const fromJson = page.json
      .flatMap((entry) => findOfferArray(entry.body))
      .map(mapAmsJob)
      .filter((p): p is RawJobPosting => p !== null);
    if (fromJson.length > 0) return fromJson;
    return parseLinkCards(page.html, {
      sourceKey: "ams",
      baseUrl: AMS,
      country: "at",
      linkPattern: /\/public\/emps\/job\/([^/?#]+)/,
    });
  },
});

// ---------- StepStone.at ----------

function stepstoneSlug(keywords: string[]): string {
  return encodeURIComponent(keywords.join(" ").trim().toLowerCase().replace(/\s+/g, "-"));
}

/**
 * StepStone.at — large Austrian board, JS-rendered. Cards carry stable
 * data-at attributes; detail links end in --<id>-inline.html.
 * (StepStone.de is deliberately not included: it sits behind Akamai.)
 */
export const stepstoneAtConnector = browserBoardConnector({
  key: "stepstone-at",
  name: "StepStone.at",
  countries: ["at"],
  homepage: "https://www.stepstone.at/",
  locale: "de-AT",
  waitForSelector: "article[data-at='job-item'], a[href*='-inline.html']",
  pageUrl: (params, page) => {
    const location = params.locations[0] ? `/in-${stepstoneSlug([params.locations[0]])}` : "";
    return `https://www.stepstone.at/jobs/${stepstoneSlug(params.keywords)}${location}${
      page > 1 ? `?page=${page}` : ""
    }`;
  },
  parse: (page) =>
    parseLinkCards(page.html, {
      sourceKey: "stepstone-at",
      baseUrl: "https://www.stepstone.at",
      country: "at",
      linkPattern: /--(\d{5,})-inline\.html/,
      cardSelector: "article[data-at='job-item'], article",
      titleSelector: "[data-at='job-item-title']",
      companySelector: "[data-at='job-item-company-name']",
      locationSelector: "[data-at='job-item-location']",
      salarySelector: "[data-at='job-item-salary-info']",
    }),
});
