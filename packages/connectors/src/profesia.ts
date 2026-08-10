import * as cheerio from "cheerio";
import type { NormalizedSearchParams, RawJobPosting } from "@jobbiq/core";
import type { JobConnector } from "./types";
import { fetchText, sleep } from "./types";

const BASE = "https://www.profesia.sk";

/**
 * Parses a Profesia.sk search-results page (exported for offline tests).
 * Selectors are defensive — the site is scraped best-effort and may need
 * updating when Profesia changes markup.
 */
export function parseProfesiaListing(html: string): RawJobPosting[] {
  const $ = cheerio.load(html);
  const postings: RawJobPosting[] = [];

  $("li.list-row").each((_, element) => {
    const row = $(element);
    const titleLink = row.find("h2 a").first();
    const href = titleLink.attr("href");
    const title = titleLink.text().trim();
    if (!href || !title) return;

    const idMatch = href.match(/O(\d+)/);
    const externalId = idMatch ? idMatch[1] : href;
    const company = row.find(".employer").first().text().trim();
    const location = row.find(".job-location").first().text().trim();
    const salary =
      row.find(".label-group .label-bordered").first().text().trim() ||
      row.find(".salary-label, .green").first().text().trim();
    const snippet = row.find(".search-result-desc, p").first().text().trim();

    postings.push({
      sourceKey: "profesia",
      externalId,
      url: href.startsWith("http") ? href : `${BASE}${href}`,
      title,
      company: company || "Unknown",
      location: location || null,
      remoteType: /home\s*office|remote|z domu/i.test(row.text())
        ? "REMOTE"
        : null,
      salaryText: salary || null,
      description: snippet || title,
      applyEmail: null,
      applyUrl: href.startsWith("http") ? href : `${BASE}${href}`,
      postedAt: null,
    });
  });

  return postings;
}

/** Profesia.sk — the main Slovak job board (best-effort HTML scraping). */
export const profesiaConnector: JobConnector = {
  key: "profesia",
  name: "Profesia.sk",
  type: "scrape",
  requiredEnv: [],

  async *search(params: NormalizedSearchParams): AsyncIterable<RawJobPosting> {
    const query = encodeURIComponent(params.keywords.join(" "));
    let fetched = 0;

    for (let page = 1; page <= 3 && fetched < params.maxResults; page++) {
      const url = `${BASE}/praca/?search_anywhere=${query}${
        page > 1 ? `&page_num=${page}` : ""
      }`;
      const html = await fetchText(url);
      const postings = parseProfesiaListing(html);
      if (postings.length === 0) return;

      for (const posting of postings) {
        yield posting;
        fetched++;
        if (fetched >= params.maxResults) return;
      }
      await sleep(800); // politeness delay between pages
    }
  },
};
