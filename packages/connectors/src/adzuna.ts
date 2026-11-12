import type { NormalizedSearchParams, RawJobPosting } from "@jobbiq/core";
import type { JobConnector } from "./types";
import { fetchJson } from "./types";

interface AdzunaResult {
  id: string;
  redirect_url: string;
  title: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  description: string;
  salary_min?: number;
  salary_max?: number;
  created?: string;
}

interface AdzunaResponse {
  results: AdzunaResult[];
}

const PAGE_SIZE = 50;

export const adzunaConnector: JobConnector = {
  key: "adzuna",
  name: "Adzuna",
  type: "api",
  requiredEnv: ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"],
  // Adzuna has no SK / CZ / HU index.
  countries: ["de", "at", "pl"],
  homepage: "https://www.adzuna.de/",

  async *search(params: NormalizedSearchParams): AsyncIterable<RawJobPosting> {
    const appId = process.env.ADZUNA_APP_ID;
    const appKey = process.env.ADZUNA_APP_KEY;
    if (!appId || !appKey) {
      throw new Error("Adzuna connector requires ADZUNA_APP_ID and ADZUNA_APP_KEY");
    }

    const country = params.country ?? "de";
    let fetched = 0;
    const maxPages = Math.ceil(params.maxResults / PAGE_SIZE);

    for (let page = 1; page <= maxPages; page++) {
      const query = new URLSearchParams({
        app_id: appId,
        app_key: appKey,
        results_per_page: String(PAGE_SIZE),
        what: params.keywords.join(" "),
        "content-type": "application/json",
      });
      if (params.locations[0]) {
        query.set("where", params.locations[0]);
      }
      if (params.salaryMin) {
        query.set("salary_min", String(params.salaryMin));
      }

      const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?${query}`;
      const data = await fetchJson<AdzunaResponse>(url);
      if (!data.results?.length) return;

      for (const job of data.results) {
        yield {
          sourceKey: "adzuna",
          externalId: job.id,
          url: job.redirect_url,
          title: job.title,
          company: job.company?.display_name ?? "Unknown",
          location: job.location?.display_name ?? null,
          remoteType: null,
          salaryText:
            job.salary_min || job.salary_max
              ? `${job.salary_min ?? "?"} – ${job.salary_max ?? "?"}`
              : null,
          description: job.description,
          applyEmail: null,
          applyUrl: job.redirect_url,
          postedAt: job.created ? new Date(job.created) : null,
          country,
        };
        fetched++;
        if (fetched >= params.maxResults) return;
      }
    }
  },
};
