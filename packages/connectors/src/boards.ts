import type { NormalizedSearchParams } from "@jobbiq/core";
import { htmlListingConnector, parseLinkCards } from "./cards";

/**
 * Server-rendered job boards scraped from their public listing pages.
 * Every URL goes through fetchText → robots.txt is checked at runtime, so a
 * board that disallows a path is skipped rather than scraped.
 *
 * Selectors are keyed on detail-link patterns (they carry the ad ID) and
 * verified against the boards' markup as documented in Sep–Nov 2026.
 */

const q = (params: NormalizedSearchParams) => encodeURIComponent(params.keywords.join(" "));

// ---------- Slovakia ----------

/** Kariera.sk (Zoznam) — free-text search (?q=) is robots-disallowed, so we
 * walk the newest listing pages and filter by keyword locally. */
export const karieraConnector = htmlListingConnector({
  key: "kariera",
  name: "Kariera.sk",
  countries: ["sk"],
  homepage: "https://kariera.zoznam.sk/",
  filterKeywords: true,
  maxPages: 10,
  minIntervalMs: 3000,
  pageUrl: (_, page) => `https://kariera.zoznam.sk/pracovne-ponuky?od=${(page - 1) * 30}`,
  parse: (html) =>
    parseLinkCards(html, {
      sourceKey: "kariera",
      baseUrl: "https://kariera.zoznam.sk",
      country: "sk",
      linkPattern: /\/pracovna-ponuka\/(\d+)/,
      cardSelector: "div.offer, article, li",
    }),
});

/** Worki.sk (ISTP.sk redirects here) — small, server-rendered. */
export const workiConnector = htmlListingConnector({
  key: "worki",
  name: "Worki.sk",
  countries: ["sk"],
  homepage: "https://www.worki.sk/",
  filterKeywords: true,
  maxPages: 10,
  pageUrl: (_, page) =>
    page === 1 ? "https://www.worki.sk/ponuka-prace" : `https://www.worki.sk/ponuka-prace/${page}`,
  parse: (html) =>
    parseLinkCards(html, {
      sourceKey: "worki",
      baseUrl: "https://www.worki.sk",
      country: "sk",
      linkPattern: /\/ponuka-prace\/[^/]+\/(\d+)-/,
    }),
});

// ---------- Czech Republic ----------

/** Prace.cz (Alma Career) — server-rendered, /nabidky/ is robots-allowed. */
export const praceCzConnector = htmlListingConnector({
  key: "prace-cz",
  name: "Práce.cz",
  countries: ["cz"],
  homepage: "https://www.prace.cz/",
  pageUrl: (params, page) =>
    `https://www.prace.cz/nabidky/?q%5B%5D=${q(params)}${page > 1 ? `&page=${page}` : ""}`,
  parse: (html) =>
    parseLinkCards(html, {
      sourceKey: "prace-cz",
      baseUrl: "https://www.prace.cz",
      country: "cz",
      linkPattern: /\/nabidka\/([0-9a-z-]{6,})\/?/i,
      cardSelector: "article, li",
    }),
});

/** Jobs.cz (Alma Career) — the largest Czech board; /prace/ is robots-allowed.
 * Handles both the classic (/rpd/<id>/) and the new (/nabidka/<uuid>/) URLs. */
export const jobsCzConnector = htmlListingConnector({
  key: "jobs-cz",
  name: "Jobs.cz",
  countries: ["cz"],
  homepage: "https://www.jobs.cz/",
  pageUrl: (params, page) =>
    `https://www.jobs.cz/prace/?q%5B%5D=${q(params)}${page > 1 ? `&page=${page}` : ""}`,
  parse: (html) =>
    parseLinkCards(html, {
      sourceKey: "jobs-cz",
      baseUrl: "https://www.jobs.cz",
      country: "cz",
      linkPattern: /\/(?:rpd|pd|nabidka)\/([0-9a-z-]{5,})\/?/i,
      cardSelector: "article, li",
      titleSelector: "h2",
    }),
});

/** Jenprace.cz — server-rendered search. */
export const jenpraceConnector = htmlListingConnector({
  key: "jenprace",
  name: "Jenprace.cz",
  countries: ["cz"],
  homepage: "https://www.jenprace.cz/",
  pageUrl: (params, page) =>
    `https://www.jenprace.cz/nabidky?q=${q(params)}${page > 1 ? `&page=${page}` : ""}`,
  parse: (html) =>
    parseLinkCards(html, {
      sourceKey: "jenprace",
      baseUrl: "https://www.jenprace.cz",
      country: "cz",
      linkPattern: /\/nabidka\/([^/?#]+)\//,
      cardSelector: "article, li",
    }),
});

// ---------- Hungary ----------

/** Profession.hu — the largest Hungarian board; listing and /allas/ detail
 * pages are robots-allowed. Search path: /allasok/<page>,0,0,<keyword>. */
export const professionHuConnector = htmlListingConnector({
  key: "profession-hu",
  name: "Profession.hu",
  countries: ["hu"],
  homepage: "https://www.profession.hu/",
  minIntervalMs: 2000,
  pageUrl: (params, page) =>
    `https://www.profession.hu/allasok/${page},0,0,${q(params)}`,
  parse: (html) =>
    parseLinkCards(html, {
      sourceKey: "profession-hu",
      baseUrl: "https://www.profession.hu",
      country: "hu",
      linkPattern: /\/allas\/[^?#"]*?-(\d+)(?:[/?#]|$)/,
      cardSelector: "li[data-prof-id], li, article",
      companySelector: ".job-card__company-name, [class*='company'], [data-item-brand]",
      locationSelector: ".job-card__company-address, [class*='address'], [class*='location']",
    }),
});

// ---------- Austria ----------

/** karriere.at — the leading Austrian board, server-rendered search. */
export const karriereAtConnector = htmlListingConnector({
  key: "karriere-at",
  name: "karriere.at",
  countries: ["at"],
  homepage: "https://www.karriere.at/",
  minIntervalMs: 2000,
  pageUrl: (params, page) => {
    const query = new URLSearchParams({ keywords: params.keywords.join(" ") });
    if (params.locations[0]) query.set("locations", params.locations[0]);
    if (page > 1) query.set("page", String(page));
    return `https://www.karriere.at/jobs?${query}`;
  },
  parse: (html) =>
    parseLinkCards(html, {
      sourceKey: "karriere-at",
      baseUrl: "https://www.karriere.at",
      country: "at",
      linkPattern: /(?:karriere\.at)?\/jobs\/(\d{5,})/,
      cardSelector: "li, article",
    }),
});
