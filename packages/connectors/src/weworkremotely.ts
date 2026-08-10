import { XMLParser } from "fast-xml-parser";
import type { NormalizedSearchParams, RawJobPosting } from "@jobbiq/core";
import type { JobConnector } from "./types";
import { fetchText, matchesKeywords, stripHtml } from "./types";

interface RssItem {
  title?: string;
  description?: string;
  link?: string;
  guid?: string | { "#text"?: string };
  pubDate?: string;
  region?: string;
}

const FEEDS = [
  "https://weworkremotely.com/categories/remote-programming-jobs.rss",
  "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
];

/** Parses a WWR RSS feed into raw postings (exported for offline tests). */
export function parseWwrRss(xml: string): RawJobPosting[] {
  const parser = new XMLParser({ ignoreAttributes: true });
  const parsed = parser.parse(xml);
  const items: RssItem[] = parsed?.rss?.channel?.item ?? [];
  const list = Array.isArray(items) ? items : [items];

  return list
    .filter((item) => item?.title && item?.link)
    .map((item) => {
      // Titles are "Company: Job Title"
      const [company, ...titleParts] = String(item.title).split(":");
      const title = titleParts.join(":").trim() || String(item.title);
      const guid =
        typeof item.guid === "object" ? item.guid?.["#text"] : item.guid;
      return {
        sourceKey: "weworkremotely",
        externalId: String(guid ?? item.link),
        url: String(item.link),
        title,
        company: titleParts.length > 0 ? company.trim() : "Unknown",
        location: item.region ? String(item.region) : "Remote",
        remoteType: "REMOTE" as const,
        salaryText: null,
        description: stripHtml(String(item.description ?? title)),
        applyEmail: null,
        applyUrl: String(item.link),
        postedAt: item.pubDate ? new Date(item.pubDate) : null,
      };
    });
}

/** We Work Remotely — public RSS feeds. */
export const weworkremotelyConnector: JobConnector = {
  key: "weworkremotely",
  name: "We Work Remotely",
  type: "api",
  requiredEnv: [],

  async *search(params: NormalizedSearchParams): AsyncIterable<RawJobPosting> {
    const seen = new Set<string>();
    let fetched = 0;

    for (const feed of FEEDS) {
      const xml = await fetchText(feed);
      for (const posting of parseWwrRss(xml)) {
        if (seen.has(posting.externalId)) continue;
        seen.add(posting.externalId);
        if (
          !matchesKeywords(
            `${posting.title}\n${posting.description}`,
            params.keywords,
          )
        ) {
          continue;
        }
        yield posting;
        fetched++;
        if (fetched >= params.maxResults) return;
      }
    }
  },
};
