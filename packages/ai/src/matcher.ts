import { z } from "zod";
import type { CandidateProfileData } from "@jobbiq/core";
import { MODELS } from "./client";
import { parseStructured } from "./structured";

export const MATCHER_PROMPT_VERSION = "matcher-v2-openai";

export const matchScoreSchema = z.object({
  score: z
    .number()
    .int()
    .describe("Overall fit 0-100; 80+ = strong match, below 40 = poor match"),
  pros: z.array(z.string()).describe("Concrete reasons the candidate fits, max 4"),
  cons: z.array(z.string()).describe("Concrete concerns or gaps, max 4"),
  missingSkills: z
    .array(z.string())
    .describe("Required skills the candidate does not list"),
});

export type MatchScoreData = z.infer<typeof matchScoreSchema>;

export interface MatchJobInput {
  title: string;
  company: string;
  location?: string | null;
  description: string;
}

const SYSTEM_PROMPT = `You evaluate how well a candidate fits a job posting.

Rules:
- Base the assessment strictly on the candidate profile and the posting text.
- Score 0-100: 80+ only when core requirements are clearly met; below 40 when
  the role's core stack or seniority does not match.
- Pros/cons must reference specific skills, experience, or requirements —
  no generic statements.
- List missing skills only if the posting actually requires them.`;

export async function scoreJobMatch(input: {
  profile: CandidateProfileData;
  job: MatchJobInput;
}): Promise<MatchScoreData> {
  const { profile, job } = input;

  const description =
    job.description.length > 8000
      ? `${job.description.slice(0, 8000)}…`
      : job.description;

  const user = [
    `## Job posting`,
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    job.location ? `Location: ${job.location}` : null,
    `Description:\n${description}`,
    ``,
    `## Candidate profile`,
    JSON.stringify(profile, null, 2),
    ``,
    `Evaluate the fit.`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return parseStructured({
    model: MODELS.matcher,
    schema: matchScoreSchema,
    schemaName: "match_score",
    system: SYSTEM_PROMPT,
    user,
  });
}
