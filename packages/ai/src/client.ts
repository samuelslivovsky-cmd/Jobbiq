import OpenAI from "openai";

let client: OpenAI | undefined;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    client = new OpenAI(); // reads OPENAI_API_KEY from the environment
  }
  return client;
}

/**
 * Models are env-configurable; gpt-5-mini is a good cost/quality default for
 * a hobby deployment. Bump individual flows to gpt-5 via env if needed.
 */
export const MODELS = {
  cvParser: process.env.AI_MODEL_CV_PARSER ?? "gpt-5-mini",
  emailWriter: process.env.AI_MODEL_EMAIL_WRITER ?? "gpt-5-mini",
  matcher: process.env.AI_MODEL_MATCHER ?? "gpt-5-mini",
  roleSuggester: process.env.AI_MODEL_ROLE_SUGGESTER ?? "gpt-5-mini",
} as const;
