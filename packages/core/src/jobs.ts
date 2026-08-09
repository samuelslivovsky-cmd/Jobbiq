import { z } from "zod";

export const remoteTypeSchema = z.enum(["ON_SITE", "HYBRID", "REMOTE", "ANY"]);
export type RemoteTypeValue = z.infer<typeof remoteTypeSchema>;

/** Search parameters normalized across all connectors. */
export const normalizedSearchParamsSchema = z.object({
  keywords: z.array(z.string()),
  locations: z.array(z.string()).default([]),
  remoteType: remoteTypeSchema.default("ANY"),
  salaryMin: z.number().int().positive().nullable().default(null),
  /** ISO country code hint for API connectors, e.g. "sk", "cz", "gb". */
  country: z.string().length(2).nullable().default(null),
  maxResults: z.number().int().positive().max(500).default(100),
});
export type NormalizedSearchParams = z.infer<typeof normalizedSearchParamsSchema>;

/** A job posting as returned by a connector, before persistence. */
export const rawJobPostingSchema = z.object({
  sourceKey: z.string(),
  externalId: z.string(),
  url: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string().nullable(),
  remoteType: remoteTypeSchema.exclude(["ANY"]).nullable(),
  salaryText: z.string().nullable(),
  description: z.string(),
  applyEmail: z.string().nullable(),
  applyUrl: z.string().nullable(),
  postedAt: z.coerce.date().nullable(),
});
export type RawJobPosting = z.infer<typeof rawJobPostingSchema>;

export interface MatchReasoning {
  pros: string[];
  cons: string[];
  missingSkills: string[];
}
