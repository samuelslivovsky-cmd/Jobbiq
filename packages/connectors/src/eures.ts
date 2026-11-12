import type { CountryCode, NormalizedSearchParams, RawJobPosting } from "@jobbiq/core";
import type { JobConnector } from "./types";
import { cleanText, fetchJson, stripHtml } from "./types";

/**
 * EURES — the European Commission's job mobility portal. Aggregates vacancies
 * from the public employment services of every EU country (Ústredie PSVR,
 * Úřad práce ČR, NFSZ, CBOP, BA, AMS, …) through a keyless JSON API.
 * Spec: github.com/rorar/EURES-API-Documentation.
 */
const API = "https://europa.eu/eures/api/jv-searchengine/public";
const PAGE_SIZE = 50;

export interface EuresJob {
  id: string;
  title?: string;
  description?: string;
  creationDate?: number | string;
  lastModificationDate?: number | string;
  /** country code → list of NUTS / place codes */
  locationMap?: Record<string, string[]>;
  employer?: { name?: string };
  positionScheduleCodes?: string[];
}

interface EuresResponse {
  numberRecords?: number;
  jvs?: EuresJob[];
}

function toDate(value: number | string | undefined): Date | null {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function mapEuresJob(job: EuresJob, country: CountryCode | null): RawJobPosting | null {
  const title = cleanText(job.title);
  if (!job.id || !title) return null;

  const countries = Object.keys(job.locationMap ?? {}).map((c) => c.toLowerCase());
  const jobCountry = country ?? (countries[0] || null);
  const url = `https://europa.eu/eures/portal/jv-se/jv-details/${encodeURIComponent(job.id)}?lang=en`;
  const description = job.description ? stripHtml(job.description) : title;
  const remote = /home\s*office|remote|homeoffice|z domu|zdaln|távmunka|mobiles arbeiten/i.test(
    `${title}\n${description.slice(0, 2000)}`,
  );

  return {
    sourceKey: "eures",
    externalId: job.id,
    url,
    title,
    company: cleanText(job.employer?.name) || "Unknown",
    location: jobCountry ? jobCountry.toUpperCase() : null,
    remoteType: remote ? "REMOTE" : null,
    salaryText: null,
    description,
    applyEmail: null,
    applyUrl: url,
    postedAt: toDate(job.creationDate) ?? toDate(job.lastModificationDate),
    country: jobCountry && jobCountry.length === 2 ? jobCountry : null,
  };
}

export function buildEuresSearchBody(keywords: string[], country: string, page: number) {
  return {
    resultsPerPage: PAGE_SIZE,
    page,
    sortSearch: "MOST_RECENT",
    keywords: keywords.length
      ? [{ keyword: keywords.join(" "), specificSearchCode: "EVERYWHERE" }]
      : [],
    publicationPeriod: "LAST_MONTH",
    occupationUris: [],
    skillUris: [],
    requiredExperienceCodes: [],
    positionScheduleCodes: [],
    sectorCodes: [],
    educationAndQualificationLevelCodes: [],
    positionOfferingCodes: [],
    locationCodes: [country],
    euresFlagCodes: [],
    otherBenefitsCodes: [],
    requiredLanguages: [],
    minNumberPost: null,
    sessionId: "jobbiq",
    requestLanguage: "en",
  };
}

export const euresConnector: JobConnector = {
  key: "eures",
  name: "EURES (EU public employment services)",
  type: "api",
  requiredEnv: [],
  countries: ["sk", "cz", "hu", "pl", "de", "at"],
  homepage: "https://europa.eu/eures/portal/jv-se/home",

  async *search(params: NormalizedSearchParams): AsyncIterable<RawJobPosting> {
    if (!params.country) return;
    let fetched = 0;
    const maxPages = Math.ceil(params.maxResults / PAGE_SIZE);

    for (let page = 1; page <= maxPages; page++) {
      const data = await fetchJson<EuresResponse>(`${API}/jv-search/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildEuresSearchBody(params.keywords, params.country, page)),
      });
      const jobs = data.jvs ?? [];
      if (jobs.length === 0) return;

      for (const job of jobs) {
        const posting = mapEuresJob(job, params.country as CountryCode);
        if (!posting) continue;
        yield posting;
        if (++fetched >= params.maxResults) return;
      }
      if (jobs.length < PAGE_SIZE) return;
    }
  },
};
