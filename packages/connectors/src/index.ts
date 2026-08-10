import type { JobConnector } from "./types";
import { adzunaConnector } from "./adzuna";
import { remotiveConnector } from "./remotive";
import { joobleConnector } from "./jooble";
import { remoteokConnector } from "./remoteok";
import { arbeitnowConnector } from "./arbeitnow";
import { jobicyConnector } from "./jobicy";
import { weworkremotelyConnector } from "./weworkremotely";
import { profesiaConnector } from "./profesia";

export * from "./types";
export { adzunaConnector } from "./adzuna";
export { remotiveConnector } from "./remotive";
export { joobleConnector } from "./jooble";
export { remoteokConnector } from "./remoteok";
export { arbeitnowConnector } from "./arbeitnow";
export { jobicyConnector } from "./jobicy";
export { weworkremotelyConnector, parseWwrRss } from "./weworkremotely";
export { profesiaConnector, parseProfesiaListing } from "./profesia";

const all: JobConnector[] = [
  profesiaConnector,
  adzunaConnector,
  joobleConnector,
  remotiveConnector,
  remoteokConnector,
  weworkremotelyConnector,
  arbeitnowConnector,
  jobicyConnector,
];

export const connectorRegistry: ReadonlyMap<string, JobConnector> = new Map(
  all.map((c) => [c.key, c]),
);

export function getConnector(key: string): JobConnector {
  const connector = connectorRegistry.get(key);
  if (!connector) {
    throw new Error(`Unknown job connector: ${key}`);
  }
  return connector;
}
