import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { parser } from "stream-json";
import { pick } from "stream-json/filters/Pick";
import { streamArray } from "stream-json/streamers/StreamArray";
import type { NormalizedSearchParams, RawJobPosting } from "@jobbiq/core";
import type { JobConnector } from "./types";
import { cleanText, looksRemote, matchesKeywords, matchesLocation, memoize, politeFetch } from "./types";

/**
 * Úřad práce ČR — official open data of all vacancies registered with the
 * Czech Labour Office (~40k, refreshed daily) published by MPSV at
 * data.mpsv.cz. One gzipped JSON dump, stream-parsed so memory stays low.
 * Heavy (≈180 MB uncompressed) → runs from the local crawler, not on Vercel.
 */
const DUMP_URL = "https://data.mpsv.cz/od/soubory/volna-mista/volna-mista.json.gz";

type Json = Record<string, unknown>;

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const obj = value as Json;
    return text(obj.cs ?? obj.nazev ?? obj.hodnota ?? obj.value ?? "");
  }
  return "";
}

function places(item: Json): string[] {
  const misto = item.mistoVykonuPrace as Json | undefined;
  const pracoviste = (misto?.pracoviste ?? []) as Json[];
  const names = pracoviste.map((p) => {
    const adresa = (p.adresa ?? {}) as Json;
    return cleanText(text(adresa.obec ?? p.obec ?? adresa.nazevObce ?? ""));
  });
  return [...new Set(names.filter(Boolean))];
}

export function mapMpsvItem(item: Json): RawJobPosting | null {
  const id = text(item.portalId ?? item.id);
  const title = cleanText(text(item.pozadovanaProfese));
  if (!id || !title) return null;
  const url = `https://up.gov.cz/volna-mista-v-cr#/volna-mista-detail/${encodeURIComponent(id)}`;
  const employer = (item.zamestnavatel ?? {}) as Json;
  const details = cleanText(text(item.upresnujiciInformace));
  const from = item.mesicniMzdaOd as number | undefined;
  const to = item.mesicniMzdaDo as number | undefined;
  const dateRaw = text(item.datumZmeny ?? item.datumVlozeni);
  const date = dateRaw ? new Date(dateRaw) : null;
  const externalUrl = text(item.urlAdresa);

  return {
    sourceKey: "mpsv",
    externalId: id,
    url,
    title,
    company: cleanText(text(employer.nazev)) || "Unknown",
    location: places(item).slice(0, 5).join(", ") || null,
    remoteType: looksRemote(`${title} ${details}`) ? "REMOTE" : null,
    salaryText: from || to ? `${from ?? "?"} – ${to ?? "?"} CZK / měsíc` : null,
    description: details ? `${title}\n\n${details}` : title,
    applyEmail: null,
    applyUrl: externalUrl.startsWith("http") ? externalUrl : url,
    postedAt: date && !Number.isNaN(date.getTime()) ? date : null,
    country: "cz",
  };
}

async function loadDump(): Promise<RawJobPosting[]> {
  const res = await politeFetch(DUMP_URL, { checkRobots: true, timeoutMs: 15 * 60_000 });
  if (!res.body) throw new Error("MPSV dump: empty body");
  const postings: RawJobPosting[] = [];
  const pipeline = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream)
    .pipe(createGunzip())
    .pipe(parser())
    .pipe(pick({ filter: "polozky" }))
    .pipe(streamArray());

  for await (const chunk of pipeline as AsyncIterable<{ value: Json }>) {
    const posting = mapMpsvItem(chunk.value);
    if (posting) {
      // Keep memory bounded: descriptions are only needed for matching.
      posting.description = posting.description.slice(0, 3000);
      postings.push(posting);
    }
  }
  postings.sort((a, b) => (b.postedAt?.getTime() ?? 0) - (a.postedAt?.getTime() ?? 0));
  return postings;
}

export const mpsvConnector: JobConnector = {
  key: "mpsv",
  name: "Úřad práce ČR (open data)",
  type: "api",
  requiredEnv: [],
  countries: ["cz"],
  homepage: "https://data.mpsv.cz/web/data/vypisy-volna-mista",
  heavy: true,

  async *search(params: NormalizedSearchParams): AsyncIterable<RawJobPosting> {
    const postings = await memoize("mpsv-dump", 6 * 60 * 60_000, loadDump);
    let fetched = 0;
    for (const posting of postings) {
      if (!matchesKeywords(posting.description, params.keywords)) continue;
      if (!matchesLocation(posting, params.locations)) continue;
      yield posting;
      if (++fetched >= params.maxResults) return;
    }
  },
};
