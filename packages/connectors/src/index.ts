import type { JobConnector } from "./types";
import { adzunaConnector } from "./adzuna";
import { remotiveConnector } from "./remotive";
import { joobleConnector } from "./jooble";
import { remoteokConnector } from "./remoteok";
import { arbeitnowConnector } from "./arbeitnow";
import { jobicyConnector } from "./jobicy";
import { weworkremotelyConnector } from "./weworkremotely";
import { profesiaConnector } from "./profesia";
import { euresConnector } from "./eures";
import { arbeitsagenturConnector } from "./arbeitsagentur";
import { sluzbyZamestnanostiConnector } from "./sluzbyzamestnanosti";
import { mpsvConnector } from "./mpsv";
import { cbopConnector } from "./cbop";
import { careerjetConnector } from "./careerjet";
import { nofluffjobsConnector } from "./nofluffjobs";
import { bulldogjobConnector } from "./bulldogjob";
import {
  jenpraceConnector,
  jobsCzConnector,
  karieraConnector,
  karriereAtConnector,
  praceCzConnector,
  professionHuConnector,
  workiConnector,
} from "./boards";
import { justjoinConnector, rocketjobsConnector, startupjobsConnector } from "./sitemapBoards";

export * from "./types";
export * from "./robots";
export * from "./structured";
export { parseLinkCards, htmlListingConnector } from "./cards";
export { adzunaConnector } from "./adzuna";
export { remotiveConnector } from "./remotive";
export { joobleConnector } from "./jooble";
export { remoteokConnector } from "./remoteok";
export { arbeitnowConnector } from "./arbeitnow";
export { jobicyConnector } from "./jobicy";
export { weworkremotelyConnector, parseWwrRss } from "./weworkremotely";
export { profesiaConnector, parseProfesiaListing } from "./profesia";
export { euresConnector, mapEuresJob, buildEuresSearchBody } from "./eures";
export { arbeitsagenturConnector, mapBaJob } from "./arbeitsagentur";
export { sluzbyZamestnanostiConnector, mapSzOffer } from "./sluzbyzamestnanosti";
export { mpsvConnector, mapMpsvItem } from "./mpsv";
export { cbopConnector, mapCbopOffer, findOfferArray } from "./cbop";
export { careerjetConnector } from "./careerjet";
export { nofluffjobsConnector, parseNfjState, mapNfjPosting } from "./nofluffjobs";
export { bulldogjobConnector, bulldogJobsFromHtml, mapBulldogJob } from "./bulldogjob";
export * from "./boards";
export * from "./sitemapBoards";

/** Registry order = order shown in the UI: per market, then pan-EU, then remote. */
const all: JobConnector[] = [
  // Slovakia
  profesiaConnector,
  sluzbyZamestnanostiConnector,
  karieraConnector,
  workiConnector,
  // Czech Republic
  mpsvConnector,
  jobsCzConnector,
  praceCzConnector,
  jenpraceConnector,
  startupjobsConnector,
  // Hungary
  professionHuConnector,
  // Poland
  cbopConnector,
  justjoinConnector,
  rocketjobsConnector,
  bulldogjobConnector,
  nofluffjobsConnector,
  // Germany
  arbeitsagenturConnector,
  arbeitnowConnector,
  // Austria
  karriereAtConnector,
  // Pan-European / multi-country
  euresConnector,
  adzunaConnector,
  joobleConnector,
  careerjetConnector,
  // Remote / international
  remotiveConnector,
  remoteokConnector,
  weworkremotelyConnector,
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
