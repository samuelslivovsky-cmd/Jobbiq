import type { NormalizedSearchParams, RawJobPosting } from "@jobbiq/core";
import type { JobConnector } from "./types";
import { fetchJson, stripHtml } from "./types";

interface JobicyJob {
  id: number | string;
  url: string;
  jobTitle: string;
  companyName: string;
  jobGeo?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  jobType?: string[] | string;
  pubDate?: string;
  annualSalaryMin?: number;
  annualSalaryMax?: number;
  salaryCurrency?: string;
}

interface JobicyResponse {
  jobs: JobicyJob[];
}

/** Jobicy — public API for remote jobs. */
export const jobicyConnector: JobConnector = {
  key: "jobicy",
  name: "Jobicy",
  type: "api",
  requiredEnv: [],

  async *search(params: NormalizedSearchParams): AsyncIterable<RawJobPosting> {
    const query = new URLSearchParams({
      count: String(Math.min(params.maxResults, 100)),
    });
    if (params.keywords[0]) query.set("tag", params.keywords.join(" "));

    const data = await fetchJson<JobicyResponse>(
      `https://jobicy.com/api/v2/remote-jobs?${query}`,
    );
    if (!data.jobs?.length) return;

    let fetched = 0;
    for (const job of data.jobs) {
      yield {
        sourceKey: "jobicy",
        externalId: String(job.id),
        url: job.url,
        title: job.jobTitle,
        company: job.companyName || "Unknown",
        location: job.jobGeo || "Remote",
        remoteType: "REMOTE",
        salaryText:
          job.annualSalaryMin || job.annualSalaryMax
            ? `${job.annualSalaryMin ?? "?"} – ${job.annualSalaryMax ?? "?"} ${job.salaryCurrency ?? ""}`.trim()
            : null,
        description: stripHtml(job.jobDescription ?? job.jobExcerpt ?? job.jobTitle),
        applyEmail: null,
        applyUrl: job.url,
        postedAt: job.pubDate ? new Date(job.pubDate) : null,
      };
      fetched++;
      if (fetched >= params.maxResults) return;
    }
  },
};
