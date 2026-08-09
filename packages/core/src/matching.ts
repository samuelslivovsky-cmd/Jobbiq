/**
 * Cheap, deterministic pre-matching: hard filters + lexical scoring.
 * The expensive AI rerank only runs on candidates that survive this stage.
 */

export interface MatchableJob {
  title: string;
  company: string;
  location: string | null;
  remoteType: string | null;
  description: string;
}

export interface MatchFilterPreference {
  excludeCompanies: string[];
  remoteType: string;
  locations: string[];
}

export function passesHardFilters(
  job: MatchableJob,
  preference: MatchFilterPreference,
): boolean {
  const company = job.company.toLowerCase();
  if (
    preference.excludeCompanies.some((excluded) =>
      company.includes(excluded.toLowerCase()),
    )
  ) {
    return false;
  }

  // Remote type: unknown (null) postings are never excluded.
  if (preference.remoteType !== "ANY" && job.remoteType) {
    if (preference.remoteType === "REMOTE" && job.remoteType === "ON_SITE") {
      return false;
    }
    if (preference.remoteType === "ON_SITE" && job.remoteType === "REMOTE") {
      return false;
    }
  }

  // Locations: match any listed location, or let remote postings through.
  if (preference.locations.length > 0) {
    if (job.remoteType === "REMOTE") return true;
    const location = (job.location ?? "").toLowerCase();
    if (location.length === 0) return true; // unknown location — keep
    return preference.locations.some((wanted) =>
      location.includes(wanted.toLowerCase()),
    );
  }

  return true;
}

/** Fraction (0..1) of terms that occur in the text. */
export function lexicalScore(terms: string[], text: string): number {
  if (terms.length === 0) return 0;
  const haystack = text.toLowerCase();
  const hits = terms.filter((term) =>
    haystack.includes(term.toLowerCase()),
  ).length;
  return hits / terms.length;
}

/** Terms describing the candidate, used for lexical pre-scoring. */
export function buildProfileTerms(
  skills: string[],
  keywords: string[],
): string[] {
  return [...new Set([...skills, ...keywords].map((t) => t.trim()).filter(Boolean))];
}
