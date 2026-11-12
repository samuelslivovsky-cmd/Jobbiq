import type { NormalizedSearchParams, RawJobPosting } from "@jobbiq/core";
import type { JobConnector } from "./types";
import { cleanText, fetchJson, looksRemote, stripHtml } from "./types";

/**
 * Careerjet — job search engine with national sites for all six markets.
 * Public API v4 needs a free partner key (careerjet.com/partners/api),
 * sent as HTTP Basic username; user_ip / user_agent are mandatory params.
 */
const LOCALES: Record<string, string> = {
  sk: "sk_SK",
  cz: "cs_CZ",
  hu: "hu_HU",
  pl: "pl_PL",
  de: "de_DE",
  at: "de_AT",
};
const PAGE_SIZE = 50;

interface CareerjetJob {
  title?: string;
  company?: string;
  locations?: string;
  salary?: string;
  description?: string;
  url?: string;
  date?: string;
}

interface CareerjetResponse {
  type?: string;
  jobs?: CareerjetJob[];
  pages?: number;
}

export const careerjetConnector: JobConnector = {
  key: "careerjet",
  name: "Careerjet",
  type: "api",
  requiredEnv: ["CAREERJET_API_KEY"],
  countries: ["sk", "cz", "hu", "pl", "de", "at"],
  homepage: "https://www.careerjet.com/",

  async *search(params: NormalizedSearchParams): AsyncIterable<RawJobPosting> {
    const key = process.env.CAREERJET_API_KEY;
    if (!key) throw new Error("Careerjet connector requires CAREERJET_API_KEY");
    const locale = LOCALES[params.country ?? "sk"];
    const auth = `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
    let fetched = 0;

    for (let page = 1; page <= Math.min(10, Math.ceil(params.maxResults / PAGE_SIZE)); page++) {
      const query = new URLSearchParams({
        locale_code: locale,
        keywords: params.keywords.join(" "),
        page: String(page),
        page_size: String(PAGE_SIZE),
        sort: "date",
        user_ip: process.env.CAREERJET_USER_IP ?? "127.0.0.1",
        user_agent: "JobbiqBot/0.2",
      });
      if (params.locations[0]) query.set("location", params.locations[0]);

      const data = await fetchJson<CareerjetResponse>(
        `https://search.api.careerjet.net/v4/query?${query}`,
        { headers: { Authorization: auth } },
      );
      const jobs = data.jobs ?? [];
      if (jobs.length === 0) return;

      for (const job of jobs) {
        const title = cleanText(job.title);
        if (!title || !job.url) continue;
        const description = job.description ? stripHtml(job.description) : title;
        yield {
          sourceKey: "careerjet",
          externalId: job.url,
          url: job.url,
          title,
          company: cleanText(job.company) || "Unknown",
          location: cleanText(job.locations) || null,
          remoteType: looksRemote(`${title} ${description}`) ? "REMOTE" : null,
          salaryText: cleanText(job.salary) || null,
          description,
          applyEmail: null,
          applyUrl: job.url,
          postedAt: job.date ? new Date(job.date) : null,
          country: params.country,
        };
        if (++fetched >= params.maxResults) return;
      }
      if (data.pages !== undefined && page >= data.pages) return;
    }
  },
};
