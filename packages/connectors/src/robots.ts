/**
 * Minimal robots.txt support (RFC 9309): groups by user-agent, Allow/Disallow
 * with `*` and `$` wildcards, longest match wins (ties → allow), Crawl-delay.
 */

export interface RobotsRules {
  allow: string[];
  disallow: string[];
  crawlDelaySec: number | null;
}

interface Group {
  agents: string[];
  rules: RobotsRules;
}

function emptyRules(): RobotsRules {
  return { allow: [], disallow: [], crawlDelaySec: null };
}

export function parseRobots(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const field = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: emptyRules() };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;

    if (field === "allow" && value) current.rules.allow.push(value);
    else if (field === "disallow" && value) current.rules.disallow.push(value);
    else if (field === "crawl-delay") {
      const delay = Number(value);
      if (Number.isFinite(delay) && delay >= 0) current.rules.crawlDelaySec = delay;
    }
  }
  return groups;
}

/** Rules for our bot: the most specific matching group, else `*`. */
export function rulesFor(groups: Group[], botToken: string): RobotsRules {
  const token = botToken.toLowerCase();
  const merged = emptyRules();
  let matched = groups.filter((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
  if (matched.length === 0) matched = groups.filter((g) => g.agents.includes("*"));
  for (const group of matched) {
    merged.allow.push(...group.rules.allow);
    merged.disallow.push(...group.rules.disallow);
    if (group.rules.crawlDelaySec !== null) {
      merged.crawlDelaySec = Math.max(merged.crawlDelaySec ?? 0, group.rules.crawlDelaySec);
    }
  }
  return merged;
}

function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/** Path + query of a URL, as robots rules are matched against it. */
export function robotsPath(url: string): string {
  const u = new URL(url);
  return `${u.pathname}${u.search}`;
}

export function isPathAllowed(rules: RobotsRules, path: string): boolean {
  let best: { length: number; allow: boolean } | null = null;
  const consider = (pattern: string, allow: boolean) => {
    if (!patternToRegex(pattern).test(path)) return;
    const length = pattern.length;
    if (!best || length > best.length || (length === best.length && allow)) {
      best = { length, allow };
    }
  };
  for (const pattern of rules.disallow) consider(pattern, false);
  for (const pattern of rules.allow) consider(pattern, true);
  return best === null ? true : (best as { allow: boolean }).allow;
}
