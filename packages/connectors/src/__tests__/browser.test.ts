import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { BotWallError, browserFetch, closeBrowser } from "../browser";
import { browserBoardConnector } from "../browserBoards";
import { RobotsDisallowedError } from "../http";
import { parseLinkCards } from "../cards";
import { findOfferArray } from "../jsonShape";

/**
 * Drives real headless Chromium against a local server (no external sites).
 * Skipped when Chromium isn't installed (`pnpm exec playwright install chromium`).
 */
const ROBOTS = "User-agent: *\nDisallow: /private\nDisallow: /blocked-page\n";
const PAGE = `<!doctype html><html><head><title>Jobs</title></head><body><ul id="list"></ul>
<script>
  Promise.all([fetch('/api/jobs').then(r => r.json()), fetch('/private/jobs').then(r => r.json())])
    .then(([data]) => {
      document.getElementById('list').innerHTML = data.items
        .map(j => '<li><a href="/public/emps/job/' + j.id + '">' + j.title + '</a><span class="company">' + j.company + '</span></li>')
        .join('');
    });
</script>${"<!-- padding -->".repeat(400)}</body></html>`;

let server: http.Server;
let base = "";

before(async () => {
  server = http.createServer((req, res) => {
    const json = (body: unknown) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.url === "/robots.txt") return res.end(ROBOTS);
    if (req.url?.startsWith("/api/jobs")) {
      return json({ total: 2, items: [
        { id: "A1", title: "Java Entwickler", company: "Wien GmbH" },
        { id: "A2", title: "Koch", company: "Gasthaus" },
      ] });
    }
    if (req.url?.startsWith("/private/jobs")) return json({ items: [{ id: "SECRET", title: "x" }] });
    if (req.url?.startsWith("/wall")) {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end("<html><head><title>Just a moment...</title></head><body>checking</body></html>");
    }
    if (req.url?.startsWith("/forbidden")) {
      res.writeHead(403);
      return res.end("no");
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(PAGE);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await closeBrowser();
  server.close();
});

async function orSkip<T>(t: { skip: (msg: string) => void }, run: () => Promise<T>): Promise<T | undefined> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Error && /playwright install|not installed/.test(error.message)) {
      t.skip("Chromium not installed");
      return undefined;
    }
    throw error;
  }
}

test("renders JS, captures only robots-allowed JSON", async (t) => {
  const page = await orSkip(t, () =>
    browserFetch(`${base}/jobs?query=java`, {
      minIntervalMs: 10,
      waitForSelector: "a[href*='/public/emps/job/']",
      captureJson: /\/(api|private)\//,
    }),
  );
  if (!page) return;
  const links = parseLinkCards(page.html, {
    sourceKey: "t", baseUrl: base, country: "at", linkPattern: /\/public\/emps\/job\/([^/?#]+)/,
  });
  assert.deepEqual(links.map((l) => l.externalId), ["A1", "A2"]);
  assert.equal(links[0].company, "Wien GmbH");
  assert.equal(page.json.length, 1, "the /private response must be dropped (robots.txt)");
  assert.ok(page.json[0].url.includes("/api/jobs"));
  assert.equal(findOfferArray(page.json[0].body).length, 2);
});

test("robots-disallowed page is never opened", async (t) => {
  await orSkip(t, async () => {
    await assert.rejects(browserFetch(`${base}/blocked-page`, { minIntervalMs: 10 }), RobotsDisallowedError);
  });
});

test("bot walls stop the run instead of being bypassed", async (t) => {
  await orSkip(t, async () => {
    await assert.rejects(browserFetch(`${base}/wall`, { minIntervalMs: 10 }), BotWallError);
    await assert.rejects(browserFetch(`${base}/forbidden`, { minIntervalMs: 10 }), BotWallError);
  });
});

test("browser board connector: JSON first, keyword guard", async (t) => {
  const connector = browserBoardConnector({
    key: "t", name: "T", countries: ["at"], homepage: base, locale: "de-AT", maxPages: 1,
    captureJson: /\/api\//,
    waitForSelector: "a[href*='/public/emps/job/']",
    pageUrl: () => `${base}/jobs`,
    parse: (page) =>
      findOfferArray(page.json[0]?.body).map((j) => ({
        sourceKey: "t", externalId: String(j.id), url: `${base}/job/${j.id}`, title: String(j.title),
        company: String(j.company), location: null, remoteType: null, salaryText: null,
        description: String(j.title), applyEmail: null, applyUrl: null, postedAt: null, country: "at",
      })),
  });
  const results = await orSkip(t, async () => {
    const out = [];
    for await (const p of connector.search({
      keywords: ["java"], locations: [], remoteType: "ANY", salaryMin: null, country: "at", maxResults: 10,
    })) out.push(p);
    return out;
  });
  if (!results) return;
  assert.deepEqual(results.map((r) => r.title), ["Java Entwickler"]);
});
