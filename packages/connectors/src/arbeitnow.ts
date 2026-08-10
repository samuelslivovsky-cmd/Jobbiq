import type { NormalizedSearchParams, RawJobPosting } from "@jobbiq/core";
import type { JobConnector } from "./types";
import { fetchJson, matchesKeywords, stripHtml } from "./types";

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags: string[];
  job_types: string[];
  location: string;
  created_at: number;
}

interface ArbeitnowResponse {
  data: ArbeitnowJob[];
  links?: { next?: string | null };
}

/** Arbeitnow — free public API, mostly EU (strong on Germany/visa-sponsorship). */
export const arbeitnowConnector: JobConnector = {
  key: "arbeitnow",
  name: "Arbeitnow",
  type: "api",
  requiredEnv: [],

  async *search(params: NormalizedSearchParams): AsyncIterable<RawJobPosting> {
    let fetched = 0;
    let url: string | null = "https://www.arbeitnow.com/api/job-board-api";

    for (let page = 0; page < 3 && url && fetched < params.maxResults; page++) {
      const data: ArbeitnowResponse = await fetchJson<ArbeitnowResponse>(url);
      if (!data.data?.length) return;

      for (const job of data.data) {
        const haystack = [job.title, job.description, ...(job.tags ?? [])].join("\n");
        if (!matchesKeywords(haystack, params.keywords)) continue;

        yield {
          sourceKey: "arbeitnow",
          externalId: job.slug,
          url: job.url,
          title: job.title,
          company: job.company_name || "Unknown",
          location: job.location || null,
          remoteType: job.remote ? "REMOTE" : null,
          salaryText: null,
          description: stripHtml(job.description),
          applyEmail: null,
          applyUrl: job.url,
          postedAt: job.created_at ? new Date(job.created_at * 1000) : null,
        };
        fetched++;
        if (fetched >= params.maxResults) return;
      }
      url = data.links?.next ?? null;
    }
  },
};
