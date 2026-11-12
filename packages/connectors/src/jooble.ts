import type { NormalizedSearchParams, RawJobPosting } from "@jobbiq/core";
import type { JobConnector } from "./types";
import { fetchJson } from "./types";

interface JoobleJob {
  id: number | string;
  title: string;
  location?: string;
  snippet?: string;
  salary?: string;
  link: string;
  company?: string;
  updated?: string;
}

interface JoobleResponse {
  totalCount: number;
  jobs: JoobleJob[];
}

const COUNTRY_NAMES: Record<string, string> = {
  sk: "Slovakia",
  cz: "Czech Republic",
  hu: "Hungary",
  pl: "Poland",
  de: "Germany",
  at: "Austria",
};

/** Jooble aggregator — free API key at https://jooble.org/api/about */
export const joobleConnector: JobConnector = {
  key: "jooble",
  name: "Jooble",
  type: "api",
  requiredEnv: ["JOOBLE_API_KEY"],
  countries: ["sk", "cz", "hu", "pl", "de", "at"],
  homepage: "https://jooble.org/",

  async *search(params: NormalizedSearchParams): AsyncIterable<RawJobPosting> {
    const apiKey = process.env.JOOBLE_API_KEY;
    if (!apiKey) throw new Error("Jooble connector requires JOOBLE_API_KEY");

    let fetched = 0;
    for (let page = 1; page <= 3 && fetched < params.maxResults; page++) {
      const data = await fetchJson<JoobleResponse>(
        `https://jooble.org/api/${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keywords: params.keywords.join(" "),
            location:
              params.locations[0] ?? (params.country ? COUNTRY_NAMES[params.country] : ""),
            page,
          }),
        },
      );
      if (!data.jobs?.length) return;

      for (const job of data.jobs) {
        yield {
          sourceKey: "jooble",
          externalId: String(job.id),
          url: job.link,
          title: job.title,
          company: job.company || "Unknown",
          location: job.location || null,
          remoteType: null,
          salaryText: job.salary || null,
          description: job.snippet ?? job.title,
          applyEmail: null,
          applyUrl: job.link,
          postedAt: job.updated ? new Date(job.updated) : null,
          country: params.country,
        };
        fetched++;
        if (fetched >= params.maxResults) return;
      }
    }
  },
};
