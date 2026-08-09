import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { CandidateProfileData } from "@jobbiq/core";
import { getAnthropicClient, MODELS } from "./client";

export const MATCHER_PROMPT_VERSION = "matcher-v1";

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
  const client = getAnthropicClient();
  const { profile, job } = input;

  const description =
    job.description.length > 8000
      ? `${job.description.slice(0, 8000)}…`
      : job.description;

  const response = await client.messages.parse({
    model: MODELS.matcher,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
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
          .join("\n"),
      },
    ],
    output_config: {
      format: zodOutputFormat(matchScoreSchema),
    },
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error("Match scoring returned no structured output");
  }
  return response.parsed_output;
}
