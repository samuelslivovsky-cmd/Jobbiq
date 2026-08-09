import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { CandidateProfileData } from "@jobbiq/core";
import { getAnthropicClient, MODELS } from "./client";

export const EMAIL_PROMPT_VERSION = "email-writer-v1";

export const generatedEmailSchema = z.object({
  subject: z.string(),
  body: z.string().describe("Plain-text email body, ready to send"),
  language: z.string().describe("ISO 639-1 code of the language used, e.g. sk, en"),
});

export type GeneratedEmailData = z.infer<typeof generatedEmailSchema>;

export interface EmailJobContext {
  title: string;
  company: string;
  description: string;
  location?: string | null;
}

export interface EmailTemplateOptions {
  tone?: string;
  instructions?: string | null;
}

const SYSTEM_PROMPT = `You write short, personalized job application emails on behalf of a candidate.

Hard rules:
- Use ONLY facts from the candidate profile. Never invent experience, skills, education, numbers, or achievements that are not in the profile.
- Write in the language of the job posting unless instructed otherwise.
- 120-180 words in the body. No filler, no generic praise of the company.
- Concretely connect 2-3 of the candidate's actual experiences/skills to the requirements in the posting.
- Mention that the CV is attached.
- Professional but human tone; no buzzword soup.`;

export async function generateApplicationEmail(input: {
  profile: CandidateProfileData;
  job: EmailJobContext;
  template?: EmailTemplateOptions;
}): Promise<GeneratedEmailData> {
  const client = getAnthropicClient();
  const { profile, job, template } = input;

  const userContent = [
    `## Job posting`,
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    job.location ? `Location: ${job.location}` : null,
    `Description:\n${job.description}`,
    ``,
    `## Candidate profile (the only source of facts about the candidate)`,
    JSON.stringify(profile, null, 2),
    ``,
    `## Style`,
    `Tone: ${template?.tone ?? "professional"}`,
    template?.instructions ? `Extra instructions: ${template.instructions}` : null,
    ``,
    `Write the application email.`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const response = await client.messages.parse({
    model: MODELS.emailWriter,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
    output_config: {
      format: zodOutputFormat(generatedEmailSchema),
    },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Email generation was refused by the model");
  }
  if (!response.parsed_output) {
    throw new Error("Email generation returned no structured output");
  }
  return response.parsed_output;
}
