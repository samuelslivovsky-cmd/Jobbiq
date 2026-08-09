import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | undefined;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

/**
 * Models are env-configurable; default to claude-opus-5 for both flows.
 */
export const MODELS = {
  cvParser: process.env.AI_MODEL_CV_PARSER ?? "claude-opus-5",
  emailWriter: process.env.AI_MODEL_EMAIL_WRITER ?? "claude-opus-5",
} as const;
