import * as cheerio from "cheerio";
import type { RawJobPosting } from "@jobbiq/core";
import type { CountryCode, NormalizedSearchParams } from "@jobbiq/core";
import type { JobConnector } from "./types";
import { cleanText, fetchText, looksRemote, matchesKeywords, matchesLocation } from "./types";

/**
 * Generic listing parser keyed on the detail-link URL pattern (which carries
 * the ad ID and is far more stable than CSS class names). For each matching
 * link it climbs to the enclosing card and reads company / location / salary
 * using common class-name and data-attribute conventions.
 */
export interface CardParseOptions {
  sourceKey: string;
  baseUrl: string;
  country: string | null;
  /** Matches detail-page hrefs; capture group 1 = external ID. */
  linkPattern: RegExp;
  /** Card container selector (tried first), e.g. "article, li". */
  cardSelector?: string;
  titleSelector?: string;
  companySelector?: string;
  locationSelector?: string;
  salarySelector?: string;
  /** Prefix for externalId (e.g. a sub-site) */
  idPrefix?: string;
}

const DEFAULT_CARD = "article, li, [class*='offer'], [class*='job'], [class*='result'], [class*='item']";
const DEFAULT_COMPANY =
  "[data-test*='company'], [data-testid*='company'], [data-cy*='company'], [class*='company'], [class*='employer'], [class*='firm'], [itemprop='hiringOrganization']";
const DEFAULT_LOCATION =
  "[data-test*='localit'], [data-testid*='localit'], [data-test*='location'], [data-testid*='location'], [class*='locality'], [class*='location'], [class*='place'], [itemprop='jobLocation']";
const DEFAULT_SALARY =
  "[data-test*='salary'], [data-testid*='salary'], [class*='salary'], [class*='reward'], [class*='wage']";

export function parseLinkCards(html: string, options: CardParseOptions): RawJobPosting[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const postings: RawJobPosting[] = [];

  $("a[href]").each((_, anchor) => {
    const link = $(anchor);
    const href = link.attr("href") ?? "";
    const match = href.match(options.linkPattern);
    if (!match) return;
    const id = match[1] ?? href;
    if (seen.has(id)) return;

    // Start from the parent so a link whose own class matches isn't the "card".
    const parent = link.parent();
    let card = parent.closest(options.cardSelector ?? DEFAULT_CARD);
    if (card.length === 0) card = link.parent();

    const titleEl = options.titleSelector ? card.find(options.titleSelector).first() : null;
    const title = cleanText(
      (titleEl && titleEl.length ? titleEl.text() : "") ||
        link.attr("title") ||
        link.find("h2, h3, strong, span").first().text() ||
        link.text(),
    );
    if (!title || title.length < 3 || title.length > 200) return;
    seen.add(id);

    const pick = (selector: string) => cleanText(card.find(selector).first().text());
    const company =
      pick(options.companySelector ?? DEFAULT_COMPANY) ||
      cleanText(card.attr("data-item-brand") ?? card.attr("data-company") ?? "");
    const location = pick(options.locationSelector ?? DEFAULT_LOCATION);
    const salary = pick(options.salarySelector ?? DEFAULT_SALARY);
    const url = new URL(href, options.baseUrl).toString();
    const cardText = cleanText(card.text());

    postings.push({
      sourceKey: options.sourceKey,
      externalId: `${options.idPrefix ?? ""}${id}`,
      url,
      title,
      company: company && company !== title ? company : "Unknown",
      location: location || null,
      remoteType: looksRemote(cardText) ? "REMOTE" : null,
      salaryText: salary || null,
      description: cardText.length > title.length ? cardText.slice(0, 1500) : title,
      applyEmail: null,
      applyUrl: url,
      postedAt: null,
      country: options.country,
    });
  });

  return postings;
}

export interface ListingConnectorSpec {
  key: string;
  name: string;
  countries: CountryCode[];
  homepage: string;
  /** URL of result page `page` (1-based), or null to stop. */
  pageUrl(params: NormalizedSearchParams, page: number): string | null;
  parse(html: string, params: NormalizedSearchParams): RawJobPosting[];
  maxPages?: number;
  minIntervalMs?: number;
  /** The site can't search by keyword server-side → filter locally. */
  filterKeywords?: boolean;
}

/** Paginated HTML listing → connector, with robots/politeness via fetchText. */
export function htmlListingConnector(spec: ListingConnectorSpec): JobConnector {
  return {
    key: spec.key,
    name: spec.name,
    type: "scrape",
    requiredEnv: [],
    countries: spec.countries,
    homepage: spec.homepage,
    async *search(params) {
      let fetched = 0;
      const seen = new Set<string>();
      for (let page = 1; page <= (spec.maxPages ?? 5); page++) {
        const url = spec.pageUrl(params, page);
        if (!url) return;
        const html = await fetchText(url, { minIntervalMs: spec.minIntervalMs ?? 1500 });
        const postings = spec.parse(html, params);
        const fresh = postings.filter((p) => !seen.has(p.externalId));
        if (fresh.length === 0) return;

        for (const posting of fresh) {
          seen.add(posting.externalId);
          if (spec.filterKeywords &&
              !matchesKeywords(`${posting.title} ${posting.description}`, params.keywords)) continue;
          if (!matchesLocation(posting, params.locations)) continue;
          yield posting;
          if (++fetched >= params.maxResults) return;
        }
      }
    },
  };
}
