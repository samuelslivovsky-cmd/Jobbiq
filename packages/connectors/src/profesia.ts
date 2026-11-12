import * as cheerio from "cheerio";
import type { NormalizedSearchParams, RawJobPosting } from "@jobbiq/core";
import type { JobConnector } from "./types";
import { cleanText, fetchText, looksRemote, matchesLocation } from "./types";

const SITES = {
  sk: { base: "https://www.profesia.sk", path: "/praca/" },
  cz: { base: "https://www.profesia.cz", path: "/prace/" },
} as const;

/**
 * Parses a Profesia search-results page (exported for offline tests).
 * Selectors are defensive — the site is scraped best-effort and may need
 * updating when Profesia changes markup.
 */
export function parseProfesiaListing(
  html: string,
  base: string = SITES.sk.base,
  country: "sk" | "cz" = "sk",
): RawJobPosting[] {
  const $ = cheerio.load(html);
  const postings: RawJobPosting[] = [];

  $("li.list-row").each((_, element) => {
    const row = $(element);
    const titleLink = row.find("h2 a").first();
    const href = titleLink.attr("href");
    const title = cleanText(titleLink.find(".title").text() || titleLink.text());
    if (!href || !title) return;

    const idMatch = href.match(/O(\d+)/);
    const externalId = idMatch ? idMatch[1] : href;
    const url = new URL(href, base);
    url.searchParams.delete("search_id");
    const company = cleanText(row.find(".employer").first().text());
    const location = cleanText(row.find(".job-location").first().text());
    const salary =
      cleanText(row.find(".label-group .label-bordered").first().text()) ||
      cleanText(row.find(".salary-label, .green").first().text());
    const snippet = cleanText(row.find(".search-result-desc, p").first().text());

    postings.push({
      sourceKey: "profesia",
      externalId: country === "sk" ? externalId : `cz-${externalId}`,
      url: url.toString(),
      title,
      company: company || "Unknown",
      location: location || null,
      remoteType: looksRemote(row.text()) ? "REMOTE" : null,
      salaryText: salary || null,
      description: snippet || title,
      applyEmail: null,
      applyUrl: url.toString(),
      postedAt: null,
      country,
    });
  });

  return postings;
}

/** Profesia.sk / Profesia.cz — the main Slovak job board (best-effort HTML). */
export const profesiaConnector: JobConnector = {
  key: "profesia",
  name: "Profesia",
  type: "scrape",
  requiredEnv: [],
  countries: ["sk", "cz"],
  homepage: "https://www.profesia.sk/",

  async *search(params: NormalizedSearchParams): AsyncIterable<RawJobPosting> {
    const country = params.country === "cz" ? "cz" : "sk";
    const site = SITES[country];
    const query = encodeURIComponent(params.keywords.join(" "));
    let fetched = 0;

    for (let page = 1; page <= 5 && fetched < params.maxResults; page++) {
      const url = `${site.base}${site.path}?search_anywhere=${query}${
        page > 1 ? `&page_num=${page}` : ""
      }`;
      // Profesia sits behind a WAF — keep a slow, steady pace.
      const html = await fetchText(url, { minIntervalMs: 3000 });
      const postings = parseProfesiaListing(html, site.base, country);
      if (postings.length === 0) return;

      for (const posting of postings) {
        if (!matchesLocation(posting, params.locations)) continue;
        yield posting;
        if (++fetched >= params.maxResults) return;
      }
    }
  },
};
