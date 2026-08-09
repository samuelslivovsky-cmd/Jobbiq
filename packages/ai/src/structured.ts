import type { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { getOpenAIClient } from "./client";

/** Runs a chat completion constrained to a zod schema and returns the parsed value. */
export async function parseStructured<Schema extends z.ZodType>(options: {
  model: string;
  schema: Schema;
  schemaName: string;
  system: string;
  user: string;
}): Promise<z.infer<Schema>> {
  const client = getOpenAIClient();

  const completion = await client.chat.completions.parse({
    model: options.model,
    messages: [
      { role: "system", content: options.system },
      { role: "user", content: options.user },
    ],
    response_format: zodResponseFormat(options.schema, options.schemaName),
  });

  const message = completion.choices[0]?.message;
  if (message?.refusal) {
    throw new Error(`Model refused: ${message.refusal}`);
  }
  if (!message?.parsed) {
    throw new Error("Model returned no structured output");
  }
  return message.parsed as z.infer<Schema>;
}
