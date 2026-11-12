import * as cheerio from "cheerio";
import type { RawJobPosting } from "@jobbiq/core";
import { cleanText, fetchText, stripHtml } from "./types";

/** schema.org JobPosting (the subset job boards actually fill in). */
export interface JsonLdJobPosting {
  "@type"?: string | string[];
  title?: string;
  name?: string;
  description?: string;
  datePosted?: string;
  validThrough?: string;
  employmentType?: string | string[];
  jobLocationType?: string;
  identifier?: string | { value?: string | number };
  url?: string;
  hiringOrganization?: string | { name?: string };
  jobLocation?: JsonLdPlace | JsonLdPlace[];
  baseSalary?: {
    currency?: string;
    value?: { minValue?: number; maxValue?: number; value?: number; unitText?: string } | number;
  };
}

interface JsonLdPlace {
  address?:
    | string
    | { addressLocality?: string; addressRegion?: string; addressCountry?: string | { name?: string } };
}

function isJobPosting(node: unknown): node is JsonLdJobPosting {
  if (!node || typeof node !== "object") return false;
  const type = (node as { "@type"?: unknown })["@type"];
  return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
}

/** Every JobPosting object in the page's JSON-LD blocks (handles @graph/arrays). */
export function extractJsonLdJobPostings(html: string): JsonLdJobPosting[] {
  const $ = cheerio.load(html);
  const found: JsonLdJobPosting[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(visit);
    else if (isJobPosting(node)) found.push(node);
    else if (node && typeof node === "object" && "@graph" in node) {
      visit((node as { "@graph": unknown })["@graph"]);
    }
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      visit(JSON.parse($(el).contents().text()));
    } catch {
      // malformed block — ignore
    }
  });
  return found;
}

export function jsonLdLocation(job: JsonLdJobPosting): string | null {
  const places = Array.isArray(job.jobLocation) ? job.jobLocation : job.jobLocation ? [job.jobLocation] : [];
  const names = places
    .map((place) => {
      const address = place.address;
      if (!address) return "";
      if (typeof address === "string") return address;
      return cleanText(address.addressLocality ?? address.addressRegion ?? "");
    })
    .filter(Boolean);
  return names.length ? [...new Set(names)].join(", ") : null;
}

export function jsonLdCountry(job: JsonLdJobPosting): string | null {
  const places = Array.isArray(job.jobLocation) ? job.jobLocation : job.jobLocation ? [job.jobLocation] : [];
  for (const place of places) {
    const address = place.address;
    if (address && typeof address === "object") {
      const c = address.addressCountry;
      const code = typeof c === "string" ? c : c?.name;
      if (code && code.length === 2) return code.toLowerCase();
    }
  }
  return null;
}

export function jsonLdSalary(job: JsonLdJobPosting): string | null {
  const salary = job.baseSalary;
  if (!salary) return null;
  const value = salary.value;
  if (typeof value === "number") return `${value} ${salary.currency ?? ""}`.trim();
  if (!value) return null;
  const min = value.minValue ?? value.value;
  const max = value.maxValue;
  if (min === undefined && max === undefined) return null;
  const range = max && max !== min ? `${min ?? "?"} – ${max}` : `${min}`;
  const unit = value.unitText ? ` / ${value.unitText.toLowerCase()}` : "";
  return `${range} ${salary.currency ?? ""}${unit}`.replace(/\s+/g, " ").trim();
}

/** Map a JSON-LD JobPosting to our posting shape. */
export function jsonLdToPosting(
  job: JsonLdJobPosting,
  base: { sourceKey: string; externalId: string; url: string; country?: string | null },
): RawJobPosting | null {
  const title = cleanText(job.title ?? job.name);
  if (!title) return null;
  const org = job.hiringOrganization;
  const company = cleanText(typeof org === "string" ? org : org?.name);
  const description = job.description ? stripHtml(job.description) : title;
  const posted = job.datePosted ? new Date(job.datePosted) : null;
  return {
    sourceKey: base.sourceKey,
    externalId: base.externalId,
    url: base.url,
    title,
    company: company || "Unknown",
    location: jsonLdLocation(job),
    remoteType: job.jobLocationType === "TELECOMMUTE" ? "REMOTE" : null,
    salaryText: jsonLdSalary(job),
    description,
    applyEmail: null,
    applyUrl: base.url,
    postedAt: posted && !Number.isNaN(posted.getTime()) ? posted : null,
    country: base.country ?? jsonLdCountry(job),
  };
}

export interface SitemapEntry {
  loc: string;
  lastmod: Date | null;
}

/** <loc>/<lastmod> pairs from a sitemap or sitemap index. */
export function parseSitemap(xml: string): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  const blocks = xml.match(/<(url|sitemap)>[\s\S]*?<\/\1>/g) ?? [];
  for (const block of blocks) {
    const loc = block.match(/<loc>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/loc>/)?.[1];
    if (!loc) continue;
    const lastmodRaw = block.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/)?.[1];
    const lastmod = lastmodRaw ? new Date(lastmodRaw) : null;
    entries.push({
      loc: loc.replace(/&amp;/g, "&").trim(),
      lastmod: lastmod && !Number.isNaN(lastmod.getTime()) ? lastmod : null,
    });
  }
  return entries;
}

/**
 * Turn a URL slug into searchable words ("senior-java-developer-123" →
 * "senior java developer 123") so sitemap entries can be pre-filtered by
 * keyword before fetching any detail page.
 */
export function slugText(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname).replace(/[-_/,.]+/g, " ");
  } catch {
    return url;
  }
}

/** Fetch a detail page and map its first JSON-LD JobPosting. */
export async function fetchJsonLdPosting(
  url: string,
  base: { sourceKey: string; externalId: string; country?: string | null },
  fetchOptions?: Parameters<typeof fetchText>[1],
): Promise<RawJobPosting | null> {
  const html = await fetchText(url, fetchOptions);
  const [job] = extractJsonLdJobPostings(html);
  return job ? jsonLdToPosting(job, { ...base, url }) : null;
}
