import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProfesiaListing } from "../profesia";
import { parseLinkCards } from "../cards";
import { extractJsonLdJobPostings, jsonLdToPosting, parseSitemap, slugText } from "../structured";
import { mapBaJob } from "../arbeitsagentur";
import { buildEuresSearchBody, mapEuresJob } from "../eures";
import { mapSzOffer } from "../sluzbyzamestnanosti";
import { findOfferArray, mapCbopOffer } from "../cbop";
import { mapMpsvItem } from "../mpsv";
import { mapNfjPosting, parseNfjState } from "../nofluffjobs";
import { bulldogJobsFromHtml, mapBulldogJob } from "../bulldogjob";
import { matchesKeywords, stripHtml } from "../types";

test("profesia listing (sk + cz)", () => {
  const html = `<ul>
    <li class="list-row"><h2><a href="/praca/acme/O4711?search_id=abc"><span class="title">Java Developer</span></a></h2>
      <span class="employer">ACME s.r.o.</span><span class="job-location">Bratislava</span>
      <span class="label-group"><span class="label-bordered">od 3 000 EUR/mesiac</span></span></li>
  </ul>`;
  const [sk] = parseProfesiaListing(html);
  assert.equal(sk.externalId, "4711");
  assert.equal(sk.url, "https://www.profesia.sk/praca/acme/O4711");
  assert.equal(sk.title, "Java Developer");
  assert.equal(sk.company, "ACME s.r.o.");
  assert.equal(sk.salaryText, "od 3 000 EUR/mesiac");
  assert.equal(sk.country, "sk");
  const [cz] = parseProfesiaListing(html, "https://www.profesia.cz", "cz");
  assert.equal(cz.externalId, "cz-4711");
  assert.equal(cz.country, "cz");
});

test("generic link cards (jobs.cz style, data-test attributes)", () => {
  const html = `<div>
    <article class="SearchResultCard">
      <h2><a class="SearchResultCard__titleLink" href="/rpd/2000123456/?searchId=x">Senior React vývojář</a></h2>
      <span data-test="serp-company">Firma a.s.</span>
      <li data-test="serp-locality">Praha – Karlín</li>
      <span data-test="jd-salary">80 000 – 100 000 Kč</span>
      <p>Práce z domova možná</p>
    </article>
    <article><h2><a href="/rpd/2000123457/">Tester</a></h2></article>
    <a href="/rpd/2000123456/">duplicate link</a>
  </div>`;
  const postings = parseLinkCards(html, {
    sourceKey: "jobs-cz",
    baseUrl: "https://www.jobs.cz",
    country: "cz",
    linkPattern: /\/(?:rpd|pd|nabidka)\/([0-9a-z-]{5,})\/?/i,
    cardSelector: "article, li",
  });
  assert.equal(postings.length, 2);
  const [first] = postings;
  assert.equal(first.externalId, "2000123456");
  assert.equal(first.title, "Senior React vývojář");
  assert.equal(first.company, "Firma a.s.");
  assert.equal(first.location, "Praha – Karlín");
  assert.equal(first.salaryText, "80 000 – 100 000 Kč");
  assert.equal(first.remoteType, "REMOTE");
  assert.equal(first.url, "https://www.jobs.cz/rpd/2000123456/?searchId=x");
});

test("profession.hu style cards read data-item-brand", () => {
  const html = `<ul><li data-prof-id="123" data-item-brand="Példa Kft.">
    <h2><a href="https://www.profession.hu/allas/java-fejleszto-budapest-123456?sessionId=1">Java fejlesztő</a></h2>
    <div class="job-card__company-address">Budapest</div></li></ul>`;
  const [p] = parseLinkCards(html, {
    sourceKey: "profession-hu",
    baseUrl: "https://www.profession.hu",
    country: "hu",
    linkPattern: /\/allas\/[^?#"]*?-(\d+)(?:[/?#]|$)/,
    cardSelector: "li[data-prof-id], li, article",
    companySelector: ".job-card__company-name",
    locationSelector: ".job-card__company-address",
  });
  assert.equal(p.externalId, "123456");
  assert.equal(p.company, "Példa Kft.");
  assert.equal(p.location, "Budapest");
});

test("JSON-LD JobPosting in @graph", () => {
  const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
    {"@type":"Organization","name":"X"},
    {"@type":"JobPosting","title":"Backend Engineer","description":"<p>Go &amp; Postgres</p>",
     "datePosted":"2026-11-01","hiringOrganization":{"name":"Startup s.r.o."},
     "jobLocation":{"address":{"addressLocality":"Brno","addressCountry":"CZ"}},
     "baseSalary":{"currency":"CZK","value":{"minValue":90000,"maxValue":120000,"unitText":"MONTH"}}}]}</script>`;
  const [job] = extractJsonLdJobPostings(html);
  const posting = jsonLdToPosting(job, { sourceKey: "startupjobs", externalId: "1", url: "https://x/1" })!;
  assert.equal(posting.title, "Backend Engineer");
  assert.equal(posting.company, "Startup s.r.o.");
  assert.equal(posting.location, "Brno");
  assert.equal(posting.country, "cz");
  assert.equal(posting.description, "Go & Postgres");
  assert.equal(posting.salaryText, "90000 – 120000 CZK / month");
});

test("sitemap parsing + slug keywords", () => {
  const xml = `<?xml version="1.0"?><urlset>
    <url><loc>https://justjoin.it/job-offer/acme-senior-java-developer-krakow-java</loc><lastmod>2026-11-10</lastmod></url>
    <url><loc><![CDATA[https://justjoin.it/job-offer/foo-ux-designer-warszawa-ux]]></loc></url></urlset>`;
  const entries = parseSitemap(xml);
  assert.equal(entries.length, 2);
  assert.equal(entries[1].loc, "https://justjoin.it/job-offer/foo-ux-designer-warszawa-ux");
  assert.ok(matchesKeywords(slugText(entries[0].loc), ["Java"]));
  assert.ok(!matchesKeywords(slugText(entries[1].loc), ["java"]));
});

test("Bundesagentur: v6 and legacy field names", () => {
  const v6 = mapBaJob({
    referenznummer: "10000-1234567890-S",
    stellenangebotsTitel: "Softwareentwickler (m/w/d)",
    firma: "Beispiel GmbH",
    stellenlokationen: [{ adresse: { ort: "Berlin", region: "Berlin" } }],
    datumErsteVeroeffentlichung: "2026-11-05",
    gehaltsspanneVon: 55000,
    gehaltsspanneBis: 70000,
  })!;
  assert.equal(v6.title, "Softwareentwickler (m/w/d)");
  assert.equal(v6.location, "Berlin");
  assert.equal(v6.url, "https://www.arbeitsagentur.de/jobsuche/jobdetail/10000-1234567890-S");
  assert.equal(v6.salaryText, "55000 – 70000 EUR");
  const legacy = mapBaJob({ refnr: "R1", titel: "Koch", arbeitgeber: "Hotel", arbeitsort: { ort: "Köln" } })!;
  assert.equal(legacy.company, "Hotel");
  assert.equal(legacy.location, "Köln");
});

test("EURES body + mapping", () => {
  const body = buildEuresSearchBody(["java", "spring"], "sk", 2);
  assert.deepEqual(body.locationCodes, ["sk"]);
  assert.equal(body.page, 2);
  assert.equal(body.keywords[0].keyword, "java spring");
  const posting = mapEuresJob(
    { id: "abc==", title: "Elektrikár", description: "<p>Práca z domu nie</p>", creationDate: 1762300800000,
      locationMap: { SK: ["SK010"] }, employer: { name: "Firma" } },
    "sk",
  )!;
  assert.equal(posting.country, "sk");
  assert.equal(posting.company, "Firma");
  assert.ok(posting.url.includes("jv-details/abc%3D%3D"));
  assert.ok(posting.postedAt instanceof Date);
});

test("Služby zamestnanosti offer", () => {
  const p = mapSzOffer({
    uuid: "1b2c", nazovPracovnehoMiesta: "Skladník", zamestnavatelObchodneMeno: "Sklad s.r.o.",
    miestoVykonuPrace: [{ obec: "Nitra" }], zakladnaMzda: 1100, urlExternyPortal: "https://www.profesia.sk/praca/x/O1",
  })!;
  assert.equal(p.location, "Nitra");
  assert.equal(p.salaryText, "1100 EUR");
  assert.equal(p.applyUrl, "https://www.profesia.sk/praca/x/O1");
});

test("CBOP: tolerant shape detection", () => {
  const response = { payload: { ofertyPracyPage: { content: [
    { id: 991, stanowisko: "Kierowca kat. C", pracodawca: { nazwa: "Trans Sp. z o.o." }, miejscePracy: "Poznań",
      zakresObowiazkow: "<b>Przewóz</b> towarów", wynagrodzenie: "6000 PLN", dataDodania: "2026-11-02" },
  ], totalElements: 1 } } };
  const offers = findOfferArray(response);
  assert.equal(offers.length, 1);
  const p = mapCbopOffer(offers[0])!;
  assert.equal(p.title, "Kierowca kat. C");
  assert.equal(p.company, "Trans Sp. z o.o.");
  assert.equal(p.location, "Poznań");
  assert.ok(p.description.includes("Przewóz towarów"));
});

test("MPSV open-data item", () => {
  const p = mapMpsvItem({
    id: "x1", portalId: 123456, pozadovanaProfese: { cs: "Programátor" },
    zamestnavatel: { nazev: "Soft s.r.o.", ico: "1" },
    mistoVykonuPrace: { pracoviste: [{ adresa: { obec: "Ostrava" } }] },
    mesicniMzdaOd: 50000, mesicniMzdaDo: 70000, datumZmeny: "2026-11-01", upresnujiciInformace: { cs: "Java, SQL" },
  })!;
  assert.equal(p.externalId, "123456");
  assert.equal(p.title, "Programátor");
  assert.equal(p.location, "Ostrava");
  assert.equal(p.salaryText, "50000 – 70000 CZK / měsíc");
  assert.ok(matchesKeywords(p.description, ["sql"]));
});

test("No Fluff Jobs transfer state (plain and escaped)", () => {
  const state = { "abc123": { postings: [{ id: "P1", url: "java-dev-acme-budapest", title: "Java Dev", name: "ACME",
    category: "backend", location: { fullyRemote: true, places: [{ city: "Budapest", country: { code: "HUN" } }] },
    salary: { from: 1000000, to: 1400000, currency: "HUF", type: "b2b" }, posted: 1762300800000 }] } };
  const json = JSON.stringify(state);
  for (const encoded of [json, json.replace(/"/g, "&q;")]) {
    const html = `<script id="serverApp-state" type="application/json">${encoded}</script>`;
    const [raw] = parseNfjState(html);
    const p = mapNfjPosting(raw, "hu")!;
    assert.equal(p.url, "https://nofluffjobs.com/hu/job/java-dev-acme-budapest");
    assert.equal(p.remoteType, "REMOTE");
    assert.equal(p.country, "hu"); // 3-letter code ignored → region
  }
});

test("Bulldogjob __NEXT_DATA__", () => {
  const data = { props: { pageProps: { jobs: [{ id: 42, position: "DevOps Engineer", company: { name: "Bulldog" },
    city: "Remote", remote: true, technologyTags: ["Kubernetes"], denominatedSalaryLong: { money: "20000 - 26000", currency: "PLN" } }] } } };
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`;
  const p = mapBulldogJob(bulldogJobsFromHtml(html)[0])!;
  assert.equal(p.url, "https://bulldogjob.pl/companies/jobs/42");
  assert.equal(p.salaryText, "20000 - 26000 PLN");
  assert.ok(matchesKeywords(p.description, ["kubernetes"]));
});

test("stripHtml + diacritic-insensitive keywords", () => {
  assert.equal(stripHtml("<ul><li>A&#233;</li><li>B</li></ul>"), "• Aé\n• B");
  assert.ok(matchesKeywords("Vedúci skladu", ["veduci"]));
  assert.ok(matchesKeywords("Programátor", ["PROGRAMATOR"]));
});
