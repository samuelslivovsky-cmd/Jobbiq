import { candidateProfileDataSchema, type CandidateProfileData } from "@jobbiq/core";
import { MODELS } from "./client";
import { parseStructured } from "./structured";

export const CV_PARSER_PROMPT_VERSION = "cv-parser-v2-openai";

const SYSTEM_PROMPT = `You extract structured candidate profiles from raw CV/resume text.

Rules:
- Extract only information actually present in the CV. Never invent, guess, or embellish facts.
- If a field is not present in the CV, return null (or an empty array for lists).
- Normalize dates to YYYY-MM where month is known, otherwise YYYY.
- Keep skill names short and canonical (e.g. "TypeScript", not "programming in TypeScript").
- Preserve the original language of free-text fields like the summary.`;

export async function parseCvText(rawText: string): Promise<CandidateProfileData> {
  return parseStructured({
    model: MODELS.cvParser,
    schema: candidateProfileDataSchema,
    schemaName: "candidate_profile",
    system: SYSTEM_PROMPT,
    user: `Extract the candidate profile from this CV:\n\n${rawText}`,
  });
}
