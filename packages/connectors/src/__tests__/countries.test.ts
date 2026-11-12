import { test } from "node:test";
import assert from "node:assert/strict";
import { countryOfLocation, effectiveCountries, locationsForCountry } from "@jobbiq/core";

test("known cities map to countries, incl. exonyms and diacritics", () => {
  assert.equal(countryOfLocation("Bratislava"), "sk");
  assert.equal(countryOfLocation("Košice"), "sk");
  assert.equal(countryOfLocation("Prague"), "cz");
  assert.equal(countryOfLocation("Kraków"), "pl");
  assert.equal(countryOfLocation("Wrocław"), "pl");
  assert.equal(countryOfLocation("München"), "de");
  assert.equal(countryOfLocation("Wien"), "at");
  assert.equal(countryOfLocation("Viedeň"), "at");
  assert.equal(countryOfLocation("Budapest XIII."), "hu");
  assert.equal(countryOfLocation("Remote"), null);
});

test("locations are routed to their country; unknown ones go everywhere", () => {
  const locations = ["Bratislava", "Wien", "Remote"];
  assert.deepEqual(locationsForCountry(locations, "sk"), ["Bratislava", "Remote"]);
  assert.deepEqual(locationsForCountry(locations, "at"), ["Wien", "Remote"]);
  assert.deepEqual(locationsForCountry(locations, "de"), ["Remote"]);
});

test("empty country selection means all markets", () => {
  assert.deepEqual(effectiveCountries([]), ["sk", "cz", "hu", "pl", "de", "at"]);
  assert.deepEqual(effectiveCountries(["CZ", "xx"]), ["cz"]);
});
