import type { NormalizedSearchParams, RawJobPosting } from "@jobbiq/core";
import type { JobConnector } from "./types";
import { fetchJson, matchesKeywords, stripHtml } from "./types";

interface RemoteOkJob {
  id?: string | number;
  slug?: string;
  company?: string;
  position?: string;
  tags?: string[];
  description?: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
  date?: string;
  url?: string;
  apply_url?: string;
}

/** RemoteOK — public JSON feed at https://remoteok.com/api (first item is metadata). */
export const remoteokConnector: JobConnector = {
  key: "remoteok",
  name: "RemoteOK",
  type: "api",
  requiredEnv: [],

  async *search(params: NormalizedSearchParams): AsyncIterable<RawJobPosting> {
    const data = await fetchJson<RemoteOkJob[]>("https://remoteok.com/api");
    let fetched = 0;

    for (const job of data) {
      if (!job.id || !job.position) continue; // first element is a legal notice
      const haystack = [job.position, job.description ?? "", ...(job.tags ?? [])].join("\n");
      if (!matchesKeywords(haystack, params.keywords)) continue;

      yield {
        sourceKey: "remoteok",
        externalId: String(job.id),
        url: job.url ?? `https://remoteok.com/remote-jobs/${job.slug ?? job.id}`,
        title: job.position,
        company: job.company || "Unknown",
        location: job.location || "Remote",
        remoteType: "REMOTE",
        salaryText:
          job.salary_min || job.salary_max
            ? `$${job.salary_min ?? "?"} – $${job.salary_max ?? "?"}`
            : null,
        description: stripHtml(job.description ?? job.position),
        applyEmail: null,
        applyUrl: job.apply_url ?? job.url ?? null,
        postedAt: job.date ? new Date(job.date) : null,
      };
      fetched++;
      if (fetched >= params.maxResults) return;
    }
  },
};
