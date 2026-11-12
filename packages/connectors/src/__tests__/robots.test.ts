import { test } from "node:test";
import assert from "node:assert/strict";
import { isPathAllowed, parseRobots, rulesFor } from "../robots";

const ROBOTS = `
# comment
User-agent: *
Disallow: /api/
Disallow: /*?q=*
Disallow: /search/
Allow: /search/public
Crawl-delay: 10

User-agent: GPTBot
User-agent: JobbiqBot
Disallow: /private
`;

test("generic group applies to an unknown bot", () => {
  const rules = rulesFor(parseRobots(ROBOTS), "SomeBot");
  assert.equal(isPathAllowed(rules, "/praca/"), true);
  assert.equal(isPathAllowed(rules, "/api/offers"), false);
  assert.equal(isPathAllowed(rules, "/pracovne-ponuky?q=java"), false);
  assert.equal(isPathAllowed(rules, "/pracovne-ponuky?od=30"), true);
  assert.equal(rules.crawlDelaySec, 10);
});

test("longest match wins, allow wins ties", () => {
  const rules = rulesFor(parseRobots(ROBOTS), "SomeBot");
  assert.equal(isPathAllowed(rules, "/search/x"), false);
  assert.equal(isPathAllowed(rules, "/search/public/1"), true);
});

test("a specific group replaces the * group", () => {
  const rules = rulesFor(parseRobots(ROBOTS), "JobbiqBot");
  assert.equal(isPathAllowed(rules, "/api/offers"), true);
  assert.equal(isPathAllowed(rules, "/private/x"), false);
});

test("$ anchors and empty robots", () => {
  const rules = rulesFor(parseRobots("User-agent: *\nDisallow: /*?rss$\n"), "x");
  assert.equal(isPathAllowed(rules, "/allasok?rss"), false);
  assert.equal(isPathAllowed(rules, "/allasok?rss=1"), true);
  assert.equal(isPathAllowed(rulesFor(parseRobots(""), "x"), "/anything"), true);
});

test("disallow everything", () => {
  const rules = rulesFor(parseRobots("User-agent: *\nDisallow: /\n"), "x");
  assert.equal(isPathAllowed(rules, "/jobs"), false);
});
