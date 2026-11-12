import type { NormalizedSearchParams, RawJobPosting } from "@jobbiq/core";
import type { JobConnector } from "./types";
import { cleanText, fetchJson, looksRemote, matchesKeywords, matchesLocation, memoize } from "./types";

/**
 * Služby zamestnanosti (sluzbyzamestnanosti.gov.sk) — the Slovak state job
 * portal that replaced ISTP. Its search page is backed by a public JSON
 * endpoint; besides the Labour Office's own vacancies it republishes ads from
 * Profesia, Kariera, Worki and EURES with links back to the original.
 * robots.txt only disallows the apply action (/pracovne-ponuky/* /reagovat).
 */
const BASE = "https://www.sluzbyzamestnanosti.gov.sk";
const PAGE_SIZE = 100;
/** Newest N pages are scanned once per run and filtered locally. */
const SCAN_PAGES = 25;

export interface SzOffer {
  uuid?: string;
  id?: string | number;
  nazovPracovnehoMiesta?: string;
  zamestnavatelObchodneMeno?: string;
  miestoVykonuPrace?: string | { obec?: string; nazov?: string } | Array<{ obec?: string; nazov?: string }>;
  zakladnaMzda?: string | number;
  mzda?: string;
  naposledyZmenene?: string;
  datumZverejnenia?: string;
  priznakZdroj?: string;
  urlExternyPortal?: string;
  popis?: string;
  napln?: string;
}

interface SzResponse {
  pracovnePonuky?: SzOffer[];
}

function placeText(place: SzOffer["miestoVykonuPrace"]): string | null {
  if (!place) return null;
  if (typeof place === "string") return cleanText(place) || null;
  const list = Array.isArray(place) ? place : [place];
  const names = list.map((p) => cleanText(p.obec ?? p.nazov)).filter(Boolean);
  return names.length ? [...new Set(names)].join(", ") : null;
}

export function mapSzOffer(offer: SzOffer): RawJobPosting | null {
  const id = offer.uuid ?? (offer.id !== undefined ? String(offer.id) : undefined);
  const title = cleanText(offer.nazovPracovnehoMiesta);
  if (!id || !title) return null;
  const url = `${BASE}/pracovne-ponuky/${encodeURIComponent(id)}`;
  const salary = offer.zakladnaMzda ?? offer.mzda;
  const description = cleanText(offer.popis ?? offer.napln) || title;
  const changed = offer.datumZverejnenia ?? offer.naposledyZmenene;
  const date = changed ? new Date(changed) : null;

  return {
    sourceKey: "sluzbyzamestnanosti",
    externalId: id,
    url,
    title,
    company: cleanText(offer.zamestnavatelObchodneMeno) || "Unknown",
    location: placeText(offer.miestoVykonuPrace),
    remoteType: looksRemote(`${title} ${description}`) ? "REMOTE" : null,
    salaryText: salary !== undefined && salary !== null && salary !== "" ? `${salary} EUR` : null,
    description,
    applyEmail: null,
    // Republished ads point to the original portal; apply there.
    applyUrl: offer.urlExternyPortal || url,
    postedAt: date && !Number.isNaN(date.getTime()) ? date : null,
    country: "sk",
  };
}

async function scanOffers(): Promise<RawJobPosting[]> {
  const all: RawJobPosting[] = [];
  for (let page = 1; page <= SCAN_PAGES; page++) {
    const data = await fetchJson<SzResponse>(
      `${BASE}/search/ponuky?pageNr=${page}&pageSize=${PAGE_SIZE}`,
      { checkRobots: true },
    );
    const offers = data.pracovnePonuky ?? [];
    for (const offer of offers) {
      const posting = mapSzOffer(offer);
      if (posting) all.push(posting);
    }
    if (offers.length < PAGE_SIZE) break;
  }
  return all;
}

export const sluzbyZamestnanostiConnector: JobConnector = {
  key: "sluzbyzamestnanosti",
  name: "Služby zamestnanosti (ÚPSVR)",
  type: "api",
  requiredEnv: [],
  countries: ["sk"],
  homepage: `${BASE}/`,

  async *search(params: NormalizedSearchParams): AsyncIterable<RawJobPosting> {
    const offers = await memoize("sluzbyzamestnanosti", 30 * 60_000, scanOffers);
    let fetched = 0;
    for (const posting of offers) {
      const haystack = `${posting.title} ${posting.company} ${posting.description}`;
      if (!matchesKeywords(haystack, params.keywords)) continue;
      if (!matchesLocation(posting, params.locations)) continue;
      yield posting;
      if (++fetched >= params.maxResults) return;
    }
  },
};
