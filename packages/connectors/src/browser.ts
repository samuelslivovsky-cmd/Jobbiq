import type { Browser, BrowserContext } from "playwright";
import { USER_AGENT, assertAllowedByRobots, isAllowedByRobots, waitForHost } from "./http";

/**
 * Headless-Chromium fetching (Playwright) for job boards that render their
 * results with JavaScript. LOCAL ONLY — browser connectors are flagged
 * `heavy` and never run on Vercel.
 *
 * Same rules as fetchText():
 * - robots.txt is checked for every page we navigate to, Crawl-delay honoured,
 *   per-host rate limit shared with the plain-HTTP connectors;
 * - JSON captured from the page's own background requests is used only when
 *   robots.txt allows that URL too;
 * - the user agent says what we are (HeadlessChrome … JobbiqBot);
 * - a bot wall (403/429, Cloudflare/Akamai challenge) ends the run — we don't
 *   try to get around it.
 *
 * Setup on your machine: `pnpm exec playwright install chromium`
 * (or point JOBBIQ_CHROMIUM_PATH at an existing Chromium/Chrome binary).
 */

export class BotWallError extends Error {
  constructor(url: string, detail: string) {
    super(`${new URL(url).host} shows a bot wall (${detail}) — not bypassing`);
    this.name = "BotWallError";
  }
}

let browserPromise: Promise<Browser> | null = null;
const contexts = new Map<string, Promise<BrowserContext>>();

async function launch(): Promise<Browser> {
  let playwright: typeof import("playwright");
  try {
    // Loaded lazily and hidden from bundlers: the Next.js app imports this
    // package but must never bundle Playwright (browser sources are local-only).
    const nodeRequire = eval("require") as NodeJS.Require;
    playwright = nodeRequire("playwright");
  } catch {
    throw new Error(
      "Playwright is not installed — run `pnpm install` and `pnpm exec playwright install chromium`",
    );
  }
  try {
    return await playwright.chromium.launch({
      headless: true,
      executablePath: process.env.JOBBIQ_CHROMIUM_PATH || undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Executable doesn't exist|browserType\.launch/.test(message)) {
      throw new Error(
        "Chromium for Playwright is missing — run `pnpm exec playwright install chromium` " +
          "or set JOBBIQ_CHROMIUM_PATH",
      );
    }
    throw error;
  }
}

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launch();
    browserPromise.catch(() => {
      browserPromise = null;
    });
  }
  return browserPromise;
}

/** One context per site (keeps its cookies / consent across pages). */
async function contextFor(host: string, locale: string): Promise<BrowserContext> {
  let context = contexts.get(host);
  if (!context) {
    context = (async () => {
      const browser = await getBrowser();
      const ctx = await browser.newContext({
        userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/${browser.version()} Safari/537.36 ${USER_AGENT}`,
        locale,
        viewport: { width: 1280, height: 900 },
      });
      // Don't download what we don't read.
      await ctx.route("**/*", (route) => {
        const type = route.request().resourceType();
        return ["image", "media", "font"].includes(type) ? route.abort() : route.continue();
      });
      return ctx;
    })();
    contexts.set(host, context);
    context.catch(() => contexts.delete(host));
  }
  return context;
}

export interface BrowserFetchOptions {
  /** Wait until this selector appears (results rendered). */
  waitForSelector?: string;
  /** Capture JSON responses whose URL matches (the page's own API calls). */
  captureJson?: RegExp;
  minIntervalMs?: number;
  locale?: string;
  timeoutMs?: number;
}

export interface BrowserPage {
  html: string;
  finalUrl: string;
  /** Captured JSON bodies (robots-allowed URLs only). */
  json: Array<{ url: string; body: unknown }>;
}

const WALL_MARKERS = /just a moment|attention required|access denied|verify you are human|captcha|cf-chl|_abck|px-captcha/i;

export async function browserFetch(url: string, options: BrowserFetchOptions = {}): Promise<BrowserPage> {
  const interval = await assertAllowedByRobots(url, options.minIntervalMs ?? 3000);
  const host = new URL(url).host;
  await waitForHost(host, interval);

  const context = await contextFor(host, options.locale ?? "en-US");
  const page = await context.newPage();
  const captured: Array<Promise<{ url: string; body: unknown } | null>> = [];

  if (options.captureJson) {
    const pattern = options.captureJson;
    page.on("response", (response) => {
      const responseUrl = response.url();
      if (!pattern.test(responseUrl)) return;
      if (!(response.headers()["content-type"] ?? "").includes("json")) return;
      captured.push(
        (async () => {
          if (!(await isAllowedByRobots(responseUrl))) return null;
          try {
            return { url: responseUrl, body: await response.json() };
          } catch {
            return null;
          }
        })(),
      );
    });
  }

  try {
    const timeout = options.timeoutMs ?? 45_000;
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout });
    const status = response?.status() ?? 0;
    if (status === 403 || status === 429) throw new BotWallError(url, `HTTP ${status}`);

    if (options.waitForSelector) {
      await page.waitForSelector(options.waitForSelector, { timeout: 20_000 }).catch(() => undefined);
    }
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

    const title = await page.title();
    const html = await page.content();
    if (WALL_MARKERS.test(title) || (html.length < 5000 && WALL_MARKERS.test(html))) {
      throw new BotWallError(url, "challenge page");
    }

    const json = (await Promise.all(captured)).filter(
      (entry): entry is { url: string; body: unknown } => entry !== null,
    );
    return { html, finalUrl: page.url(), json };
  } finally {
    await page.close().catch(() => undefined);
  }
}

/** Close the shared browser (call at the end of a CLI run). */
export async function closeBrowser(): Promise<void> {
  const pending = browserPromise;
  browserPromise = null;
  contexts.clear();
  if (pending) {
    const browser = await pending.catch(() => null);
    await browser?.close().catch(() => undefined);
  }
}
