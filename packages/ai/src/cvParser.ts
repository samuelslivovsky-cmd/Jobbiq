import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { candidateProfileDataSchema, type CandidateProfileData } from "@jobbiq/core";
import { getAnthropicClient, MODELS } from "./client";

export const CV_PARSER_PROMPT_VERSION = "cv-parser-v1";

const SYSTEM_PROMPT = `You extract structured candidate profiles from raw CV/resume text.

Rules:
- Extract only information actually present in the CV. Never invent, guess, or embellish facts.
- If a field is not present in the CV, return null (or an empty array for lists).
- Normalize dates to YYYY-MM where month is known, otherwise YYYY.
- Keep skill names short and canonical (e.g. "TypeScript", not "programming in TypeScript").
- Preserve the original language of free-text fields like the summary.`;

export async function parseCvText(rawText: string): Promise<CandidateProfileData> {
  const client = getAnthropicClient();

  const response = await client.messages.parse({
    model: MODELS.cvParser,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Extract the candidate profile from this CV:\n\n${rawText}`,
      },
    ],
    output_config: {
      format: zodOutputFormat(candidateProfileDataSchema),
    },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("CV parsing was refused by the model");
  }
  if (!response.parsed_output) {
    throw new Error("CV parsing returned no structured output");
  }
  return response.parsed_output;
}
