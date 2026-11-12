import type { NormalizedSearchParams, RawJobPosting } from "@jobbiq/core";
import type { JobConnector } from "./types";
import { cleanText, fetchJson, looksRemote, matchesKeywords, matchesLocation, memoize, stripHtml } from "./types";

/**
 * CBOP — Centralna Baza Ofert Pracy (oferty.praca.gov.pl), the Polish public
 * employment services' vacancy database (~18k offers). The portal's search is
 * backed by a keyless JSON endpoint returning full offers, newest first.
 * The site has no robots.txt (→ no restrictions).
 */
const BASE = "https://oferty.praca.gov.pl";
const PAGE_SIZE = 100;
const SCAN_PAGES = 20;

type Json = Record<string, unknown>;

/** First non-empty string among keys (also reads {nazwa|name|value}). */
function pickText(obj: Json, ...keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = value as Json;
      const inner = nested.nazwa ?? nested.name ?? nested.value ?? nested.miejscowosc;
      if (typeof inner === "string" && inner.trim()) return inner;
    }
  }
  return "";
}

/** The largest array of objects anywhere in the response (shape-tolerant). */
export function findOfferArray(node: unknown, depth = 0): Json[] {
  if (Array.isArray(node)) {
    return node.length && typeof node[0] === "object" ? (node as Json[]) : [];
  }
  if (!node || typeof node !== "object" || depth > 5) return [];
  let best: Json[] = [];
  for (const value of Object.values(node as Json)) {
    const found = findOfferArray(value, depth + 1);
    if (found.length > best.length) best = found;
  }
  return best;
}

export function mapCbopOffer(offer: Json): RawJobPosting | null {
  const id = pickText(offer, "id", "idOferty", "numerOferty");
  const title = cleanText(pickText(offer, "stanowisko", "nazwaStanowiska", "stanowiskoNazwa", "tytul"));
  if (!id || !title) return null;
  const url = `${BASE}/portal/lista-ofert/szczegoly-oferty/${encodeURIComponent(id)}`;
  const duties = pickText(offer, "zakresObowiazkow", "opis");
  const requirements = pickText(offer, "wymagania", "oczekiwania");
  const description = stripHtml([title, duties, requirements].filter(Boolean).join("\n\n"));
  const dateRaw = pickText(offer, "dataDodania", "dataPublikacji", "dataWprowadzenia", "dataUtworzenia");
  const date = dateRaw ? new Date(dateRaw) : null;
  const contract = pickText(offer, "rodzajUmowy");
  const salary = pickText(offer, "wynagrodzenie", "wynagrodzenieBrutto", "placa");

  return {
    sourceKey: "cbop",
    externalId: id,
    url,
    title,
    company: cleanText(pickText(offer, "pracodawca", "nazwaPracodawcy", "pracodawcaNazwa")) || "Unknown",
    location: cleanText(pickText(offer, "miejscePracy", "miejscowosc", "lokalizacja", "miejscePracyOpis")) || null,
    remoteType: looksRemote(description.slice(0, 2000)) ? "REMOTE" : null,
    salaryText: cleanText([salary, contract].filter(Boolean).join(" · ")) || null,
    description,
    applyEmail: null,
    applyUrl: url,
    postedAt: date && !Number.isNaN(date.getTime()) ? date : null,
    country: "pl",
  };
}

async function scanCbop(): Promise<RawJobPosting[]> {
  const all: RawJobPosting[] = [];
  for (let page = 0; page < SCAN_PAGES; page++) {
    const data = await fetchJson<unknown>(
      `${BASE}/portal-api/v3/oferta/wyszukiwanie?page=${page}&size=${PAGE_SIZE}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        checkRobots: true,
      },
    );
    const offers = findOfferArray(data);
    for (const offer of offers) {
      const posting = mapCbopOffer(offer);
      if (posting) all.push(posting);
    }
    if (offers.length < PAGE_SIZE) break;
  }
  return all;
}

export const cbopConnector: JobConnector = {
  key: "cbop",
  name: "CBOP (praca.gov.pl)",
  type: "api",
  requiredEnv: [],
  countries: ["pl"],
  homepage: `${BASE}/`,

  async *search(params: NormalizedSearchParams): AsyncIterable<RawJobPosting> {
    const postings = await memoize("cbop", 30 * 60_000, scanCbop);
    let fetched = 0;
    for (const posting of postings) {
      if (!matchesKeywords(`${posting.title}\n${posting.description}`, params.keywords)) continue;
      if (!matchesLocation(posting, params.locations)) continue;
      yield posting;
      if (++fetched >= params.maxResults) return;
    }
  },
};
