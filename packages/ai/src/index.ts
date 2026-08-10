export { getOpenAIClient, MODELS } from "./client";
export { parseCvText, CV_PARSER_PROMPT_VERSION } from "./cvParser";
export {
  suggestJobRoles,
  roleSuggestionsSchema,
  ROLE_SUGGESTER_PROMPT_VERSION,
  type RoleSuggestion,
} from "./roleSuggester";
export {
  scoreJobMatch,
  matchScoreSchema,
  MATCHER_PROMPT_VERSION,
  type MatchScoreData,
  type MatchJobInput,
} from "./matcher";
export {
  generateApplicationEmail,
  generatedEmailSchema,
  EMAIL_PROMPT_VERSION,
  type GeneratedEmailData,
  type EmailJobContext,
  type EmailTemplateOptions,
} from "./emailWriter";
