import type { JobConnector } from "./types";
import { adzunaConnector } from "./adzuna";
import { remotiveConnector } from "./remotive";

export * from "./types";
export { adzunaConnector } from "./adzuna";
export { remotiveConnector } from "./remotive";

const all: JobConnector[] = [adzunaConnector, remotiveConnector];

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
