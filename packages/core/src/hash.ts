import { createHash } from "crypto";

/**
 * Deduplication hash for a job posting: the same job published on several
 * portals should produce the same hash.
 */
export function jobContentHash(input: {
  title: string;
  company: string;
  location?: string | null;
}): string {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const canonical = [
    normalize(input.title),
    normalize(input.company),
    normalize(input.location ?? ""),
  ].join("|");

  return createHash("sha256").update(canonical).digest("hex");
}
