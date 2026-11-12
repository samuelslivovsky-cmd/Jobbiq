import type { NormalizedSearchParams, RawJobPosting } from "@jobbiq/core";
import type { JobConnector } from "./types";
import { HttpError, cleanText, fetchJson } from "./types";

/**
 * Bundesagentur für Arbeit — Jobsuche API (the largest German job database).
 * Public key "jobboerse-jobsuche" used by the BA's own web/app clients;
 * documented by the community at github.com/bundesAPI/jobsuche-api.
 *
 * The v6 response renamed fields (stellenangebote → ergebnisliste,
 * refnr → referenznummer, …); the parser accepts both shapes.
 */
const API = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service";
const API_KEY = "jobboerse-jobsuche";
const PAGE_SIZE = 50;
/** Newest first; older paths kept as fallbacks (the API moves between versions). */
const SEARCH_PATHS = ["/pc/v6/jobs", "/pc/v4/app/jobs", "/pc/v4/jobs"];
let workingPath: string | null = null;

async function searchPage(query: URLSearchParams): Promise<BaResponse> {
  const paths = workingPath ? [workingPath] : SEARCH_PATHS;
  let lastError: unknown;
  for (const path of paths) {
    try {
      const data = await fetchJson<BaResponse>(`${API}${path}?${query}`, {
        headers: { "X-API-Key": API_KEY },
      });
      workingPath = path;
      return data;
    } catch (error) {
      lastError = error;
      // Only a missing/retired endpoint justifies trying the next version.
      if (!(error instanceof HttpError) || ![404, 410].includes(error.status)) throw error;
    }
  }
  throw lastError;
}

interface BaLocation {
  ort?: string;
  plz?: string;
  region?: string;
  land?: string;
}

export interface BaJob {
  // v4 / v5
  refnr?: string;
  titel?: string;
  beruf?: string;
  arbeitgeber?: string;
  arbeitsort?: BaLocation;
  aktuelleVeroeffentlichungsdatum?: string;
  eintrittsdatum?: string;
  externeUrl?: string;
  // v6
  referenznummer?: string;
  stellenangebotsTitel?: string;
  firma?: string;
  stellenlokationen?: Array<{ adresse?: BaLocation } & BaLocation>;
  datumErsteVeroeffentlichung?: string;
  externeURL?: string;
  gehaltsspanneVon?: number;
  gehaltsspanneBis?: number;
}

interface BaResponse {
  stellenangebote?: BaJob[];
  ergebnisliste?: BaJob[];
  maxErgebnisse?: number | string;
}

function formatLocation(loc: BaLocation | undefined): string | null {
  if (!loc) return null;
  const parts = [loc.ort, loc.region].filter(Boolean);
  return parts.length ? [...new Set(parts)].join(", ") : null;
}

export function mapBaJob(job: BaJob): RawJobPosting | null {
  const refnr = job.referenznummer ?? job.refnr;
  const title = cleanText(job.stellenangebotsTitel ?? job.titel ?? job.beruf);
  if (!refnr || !title) return null;

  const firstLoc = job.stellenlokationen?.[0];
  const location = formatLocation(firstLoc?.adresse ?? firstLoc ?? job.arbeitsort);
  const detailUrl = `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(refnr)}`;
  const published = job.datumErsteVeroeffentlichung ?? job.aktuelleVeroeffentlichungsdatum;
  const salary =
    job.gehaltsspanneVon || job.gehaltsspanneBis
      ? `${job.gehaltsspanneVon ?? "?"} – ${job.gehaltsspanneBis ?? "?"} EUR`
      : null;

  return {
    sourceKey: "arbeitsagentur",
    externalId: refnr,
    url: detailUrl,
    title,
    company: cleanText(job.firma ?? job.arbeitgeber) || "Unknown",
    location,
    remoteType: null,
    salaryText: salary,
    description: [title, job.beruf].filter(Boolean).join("\n"),
    applyEmail: null,
    applyUrl: job.externeURL ?? job.externeUrl ?? detailUrl,
    postedAt: published ? new Date(published) : null,
    country: "de",
  };
}

export const arbeitsagenturConnector: JobConnector = {
  key: "arbeitsagentur",
  name: "Bundesagentur für Arbeit",
  type: "api",
  requiredEnv: [],
  countries: ["de"],
  homepage: "https://www.arbeitsagentur.de/jobsuche/",

  async *search(params: NormalizedSearchParams): AsyncIterable<RawJobPosting> {
    let fetched = 0;
    const maxPages = Math.ceil(params.maxResults / PAGE_SIZE);

    for (let page = 1; page <= maxPages; page++) {
      const query = new URLSearchParams({
        was: params.keywords.join(" "),
        angebotsart: "1", // employment (not apprenticeships / self-employment)
        page: String(page),
        size: String(PAGE_SIZE),
        veroeffentlichtseit: "30",
      });
      if (params.locations[0]) {
        query.set("wo", params.locations[0]);
        query.set("umkreis", "25");
      }
      if (params.remoteType === "REMOTE") query.set("arbeitszeit", "ho");

      const data = await searchPage(query);
      const jobs = data.ergebnisliste ?? data.stellenangebote ?? [];
      if (jobs.length === 0) return;

      for (const job of jobs) {
        const posting = mapBaJob(job);
        if (!posting) continue;
        if (params.remoteType === "REMOTE") posting.remoteType = "REMOTE";
        yield posting;
        if (++fetched >= params.maxResults) return;
      }
      if (jobs.length < PAGE_SIZE) return;
    }
  },
};
