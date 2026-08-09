import type { NormalizedSearchParams, RawJobPosting } from "@jobbiq/core";
import type { JobConnector } from "./types";
import { fetchJson } from "./types";

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  candidate_required_location?: string;
  salary?: string;
  description: string;
  publication_date?: string;
}

interface RemotiveResponse {
  jobs: RemotiveJob[];
}

export const remotiveConnector: JobConnector = {
  key: "remotive",
  name: "Remotive",
  type: "api",
  requiredEnv: [],

  async *search(params: NormalizedSearchParams): AsyncIterable<RawJobPosting> {
    const query = new URLSearchParams({
      search: params.keywords.join(" "),
      limit: String(params.maxResults),
    });
    const url = `https://remotive.com/api/remote-jobs?${query}`;
    const data = await fetchJson<RemotiveResponse>(url);

    for (const job of data.jobs.slice(0, params.maxResults)) {
      yield {
        sourceKey: "remotive",
        externalId: String(job.id),
        url: job.url,
        title: job.title,
        company: job.company_name,
        location: job.candidate_required_location ?? null,
        remoteType: "REMOTE",
        salaryText: job.salary ?? null,
        description: job.description,
        applyEmail: null,
        applyUrl: job.url,
        postedAt: job.publication_date ? new Date(job.publication_date) : null,
      };
    }
  },
};
