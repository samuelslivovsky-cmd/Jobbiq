import { isPathAllowed, parseRobots, robotsPath, rulesFor, type RobotsRules } from "./robots";

/** Honest bot identification; robots.txt rules are matched on "JobbiqBot". */
export const BOT_TOKEN = "JobbiqBot";
export const USER_AGENT = `${BOT_TOKEN}/0.2 (personal job aggregator; respects robots.txt)`;

const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_RETRIES = 3;

export class RobotsDisallowedError extends Error {
  constructor(url: string, reason?: string) {
    super(
      reason
        ? `robots.txt of ${new URL(url).host} unavailable (${reason}) — not crawling`
        : `robots.txt disallows ${robotsPath(url)} on ${new URL(url).host}`,
    );
    this.name = "RobotsDisallowedError";
  }
}

/** robots.txt couldn't be read (network error / 5xx) → RFC 9309: assume disallow. */
interface RobotsUnavailable {
  unavailable: string;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    statusText: string,
    readonly url: string,
  ) {
    super(`HTTP ${status} ${statusText}: ${url}`);
    this.name = "HttpError";
  }
}

// ---------- robots.txt cache ----------

type RobotsState = RobotsRules | RobotsUnavailable;
const robotsCache = new Map<string, Promise<RobotsState>>();

async function loadRobots(origin: string): Promise<RobotsState> {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    if (res.status >= 500) return { unavailable: `HTTP ${res.status}` };
    if (!res.ok) return { allow: [], disallow: [], crawlDelaySec: null }; // 4xx → no rules
    return rulesFor(parseRobots(await res.text()), BOT_TOKEN);
  } catch (error) {
    const cause = (error as { cause?: { message?: string } }).cause?.message;
    return { unavailable: cause ?? (error instanceof Error ? error.message : "network error") };
  }
}

function robotsFor(url: string): Promise<RobotsState> {
  const origin = new URL(url).origin;
  let cached = robotsCache.get(origin);
  if (!cached) {
    cached = loadRobots(origin);
    robotsCache.set(origin, cached);
  }
  return cached;
}

/** True when robots.txt of the URL's host lets our bot fetch it. */
export async function isAllowedByRobots(url: string): Promise<boolean> {
  const rules = await robotsFor(url);
  return !("unavailable" in rules) && isPathAllowed(rules, robotsPath(url));
}

// ---------- per-host politeness ----------

const nextSlot = new Map<string, number>();

/** Space requests to one host at least `minIntervalMs` apart (plus jitter). */
async function waitForHost(host: string, minIntervalMs: number): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextSlot.get(host) ?? 0);
  const jitter = Math.floor(Math.random() * minIntervalMs * 0.3);
  nextSlot.set(host, slot + minIntervalMs + jitter);
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface PoliteFetchOptions extends RequestInit {
  /** Scrapers check robots.txt before every request. Default: false (APIs). */
  checkRobots?: boolean;
  /** Minimum gap between requests to the same host. Default 1000 ms. */
  minIntervalMs?: number;
  /** Whole-request timeout incl. body download. Default 25 s. */
  timeoutMs?: number;
}

/**
 * fetch() with bot UA, timeout, per-host rate limit, retries on 429/5xx
 * (honoring Retry-After) and optional robots.txt enforcement.
 */
export async function politeFetch(url: string, options: PoliteFetchOptions = {}): Promise<Response> {
  const {
    checkRobots = false,
    minIntervalMs = 1000,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    headers,
    ...init
  } = options;

  let interval = minIntervalMs;
  if (checkRobots) {
    const rules = await robotsFor(url);
    if ("unavailable" in rules) throw new RobotsDisallowedError(url, rules.unavailable);
    if (!isPathAllowed(rules, robotsPath(url))) throw new RobotsDisallowedError(url);
    if (rules.crawlDelaySec) interval = Math.max(interval, rules.crawlDelaySec * 1000);
  }

  const host = new URL(url).host;
  for (let attempt = 0; ; attempt++) {
    await waitForHost(host, interval);
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: { "User-Agent": USER_AGENT, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (attempt >= MAX_RETRIES) throw error;
      await sleep(1000 * 2 ** attempt);
      continue;
    }

    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter, 60) * 1000
        : 1500 * 2 ** attempt);
      continue;
    }
    if (!res.ok) throw new HttpError(res.status, res.statusText, url);
    return res;
  }
}

export async function fetchJson<T>(url: string, options: PoliteFetchOptions = {}): Promise<T> {
  const res = await politeFetch(url, {
    ...options,
    headers: { Accept: "application/json", ...options.headers },
  });
  return (await res.json()) as T;
}

/** HTML/XML fetch for scrapers — robots.txt is enforced by default. */
export async function fetchText(url: string, options: PoliteFetchOptions = {}): Promise<string> {
  const res = await politeFetch(url, {
    checkRobots: true,
    ...options,
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "sk,cs;q=0.9,hu;q=0.8,pl;q=0.8,de;q=0.8,en;q=0.7",
      ...options.headers,
    },
  });
  return res.text();
}
