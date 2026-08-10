import { z } from "zod";
import type { CandidateProfileData } from "@jobbiq/core";
import { MODELS } from "./client";
import { parseStructured } from "./structured";

export const ROLE_SUGGESTER_PROMPT_VERSION = "role-suggester-v1";

export const roleSuggestionSchema = z.object({
  title: z.string().describe("Job title to search for, e.g. 'Senior TypeScript Developer'"),
  reason: z
    .string()
    .describe("One sentence: why this role fits the candidate's actual background"),
  keywords: z
    .array(z.string())
    .describe("3-5 search keywords for job boards, most important first"),
  fit: z
    .enum(["strong", "good", "stretch"])
    .describe("strong = matches current experience; stretch = growth direction"),
});

export const roleSuggestionsSchema = z.object({
  roles: z.array(roleSuggestionSchema).describe("6-8 suggestions, ordered by fit"),
});

export type RoleSuggestion = z.infer<typeof roleSuggestionSchema>;

const SYSTEM_PROMPT = `You suggest job roles/titles a candidate should search for, based on their CV profile.

Rules:
- Base suggestions strictly on the candidate's actual skills and experience.
- Mix: mostly roles matching their current level ("strong"/"good"), plus 1-2
  realistic growth directions ("stretch"). No fantasy jumps.
- Use market-standard job titles that actually appear on job boards.
- Include adjacent roles the candidate may not have considered (e.g. a
  full-stack dev might also fit platform, DX tooling, or technical-lead roles).
- Keywords must work as job-board search terms: concrete technologies and
  title words, not soft skills.
- Write the reason in the same language as the CV profile.`;

export async function suggestJobRoles(
  profile: CandidateProfileData,
): Promise<RoleSuggestion[]> {
  const result = await parseStructured({
    model: MODELS.roleSuggester,
    schema: roleSuggestionsSchema,
    schemaName: "role_suggestions",
    system: SYSTEM_PROMPT,
    user: `Suggest job roles for this candidate:\n\n${JSON.stringify(profile, null, 2)}`,
  });
  return result.roles;
}
