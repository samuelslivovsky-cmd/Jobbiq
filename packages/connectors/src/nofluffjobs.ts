import * as cheerio from "cheerio";
import type { CountryCode, NormalizedSearchParams, RawJobPosting } from "@jobbiq/core";
import type { JobConnector } from "./types";
import { cleanText, fetchText, matchesKeywords, matchesLocation } from "./types";

/**
 * No Fluff Jobs — IT board with sites for PL, HU, CZ and SK. Its JSON API
 * (/api/) is robots-disallowed, so we read the postings the server-rendered
 * search page embeds in <script id="serverApp-state"> (Angular transfer state).
 */
const BASE = "https://nofluffjobs.com";

export interface NfjPosting {
  id?: string;
  url?: string;
  title?: string;
  name?: string; // company
  category?: string;
  technology?: string;
  seniority?: string[];
  posted?: number;
  renewed?: number;
  fullyRemote?: boolean;
  location?: {
    fullyRemote?: boolean;
    places?: Array<{ city?: string; country?: { code?: string; name?: string } }>;
  };
  salary?: { from?: number; to?: number; currency?: string; type?: string };
}

function unescapeTransferState(text: string): string {
  return text
    .replace(/&q;/g, '"')
    .replace(/&s;/g, "'")
    .replace(/&l;/g, "<")
    .replace(/&g;/g, ">")
    .replace(/&a;/g, "&");
}

function findPostings(node: unknown, depth = 0): NfjPosting[] | null {
  if (!node || typeof node !== "object" || depth > 6) return null;
  const obj = node as Record<string, unknown>;
  if (Array.isArray(obj.postings)) return obj.postings as NfjPosting[];
  for (const value of Object.values(obj)) {
    const found = findPostings(value, depth + 1);
    if (found) return found;
  }
  return null;
}

/** Postings from a search page's transfer state (exported for tests). */
export function parseNfjState(html: string): NfjPosting[] {
  const $ = cheerio.load(html);
  const raw = $("script#serverApp-state").contents().text() || $("script#ng-state").contents().text();
  if (!raw) return [];
  for (const candidate of [raw, unescapeTransferState(raw)]) {
    try {
      return findPostings(JSON.parse(candidate)) ?? [];
    } catch {
      // try the next decoding
    }
  }
  return [];
}

export function mapNfjPosting(posting: NfjPosting, region: CountryCode): RawJobPosting | null {
  const slug = posting.url ?? posting.id;
  const title = cleanText(posting.title);
  if (!slug || !title) return null;
  const url = `${BASE}/${region}/job/${slug}`;
  const places = posting.location?.places ?? [];
  const cities = [...new Set(places.map((p) => cleanText(p.city)).filter(Boolean))];
  const remote = posting.location?.fullyRemote ?? posting.fullyRemote ?? false;
  const salary = posting.salary;
  const posted = posting.renewed ?? posting.posted;
  const country = places.find((p) => p.country?.code)?.country?.code?.toLowerCase();

  return {
    sourceKey: "nofluffjobs",
    externalId: posting.id ?? slug,
    url,
    title,
    company: cleanText(posting.name) || "Unknown",
    location: cities.slice(0, 5).join(", ") || null,
    remoteType: remote ? "REMOTE" : null,
    salaryText:
      salary && (salary.from || salary.to)
        ? `${salary.from ?? "?"} – ${salary.to ?? "?"} ${salary.currency ?? ""} ${salary.type ? `(${salary.type})` : ""}`.trim()
        : null,
    description: [title, posting.category, posting.technology, ...(posting.seniority ?? [])]
      .filter(Boolean)
      .join(" · "),
    applyEmail: null,
    applyUrl: url,
    postedAt: posted ? new Date(posted) : null,
    country: country && country.length === 2 ? country : region,
  };
}

export const nofluffjobsConnector: JobConnector = {
  key: "nofluffjobs",
  name: "No Fluff Jobs",
  type: "scrape",
  requiredEnv: [],
  countries: ["pl", "hu", "cz", "sk"],
  homepage: BASE,

  async *search(params: NormalizedSearchParams): AsyncIterable<RawJobPosting> {
    const region = (params.country ?? "pl") as CountryCode;
    const criteria = encodeURIComponent(params.keywords.join(" "));
    const seen = new Set<string>();
    let fetched = 0;

    for (let page = 1; page <= 5; page++) {
      const html = await fetchText(
        `${BASE}/${region}/?criteria=${criteria}${page > 1 ? `&page=${page}` : ""}`,
        { minIntervalMs: 2000 },
      );
      const postings = parseNfjState(html);
      const fresh = postings.filter((p) => p.id && !seen.has(p.id));
      if (fresh.length === 0) return;

      for (const raw of fresh) {
        seen.add(raw.id!);
        const posting = mapNfjPosting(raw, region);
        if (!posting) continue;
        // Criteria may be ignored if NFJ changes its URL scheme — guard locally.
        if (!matchesKeywords(posting.description, params.keywords)) continue;
        if (!matchesLocation(posting, params.locations)) continue;
        yield posting;
        if (++fetched >= params.maxResults) return;
      }
    }
  },
};
