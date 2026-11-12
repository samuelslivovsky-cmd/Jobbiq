# Jobbiq

Job search & apply automation: aggregates job postings from multiple sources,
matches them against a candidate profile extracted from your CV, and generates
personalized application emails. See [PLAN.md](./PLAN.md) for the full roadmap.

Deployed on **Vercel** — the Next.js app hosts the UI, the API route handlers,
and the scheduled crawling (Vercel Cron). Database is Neon / Vercel Postgres
(with pgvector), CV files go to Vercel Blob.

## Structure

```
apps/
  web/          Next.js app: UI + API routes + cron handlers (Vercel)
packages/
  db/           Prisma schema + client (PostgreSQL + pgvector)
  core/         Domain types, zod schemas, dedup hashing
  connectors/   Job source adapters (Adzuna, Remotive, ...)
  crawler/      Crawl orchestration used by the cron route
  ai/           OpenAI API wrappers (CV parsing, matching, email generation)
```

## Local development

```bash
pnpm install
cp .env.example .env          # fill in secrets
docker compose up -d          # local Postgres (pgvector)
pnpm db:migrate               # create DB schema
pnpm build
pnpm --filter @jobbiq/web dev # app on :3000
```

Trigger a crawl manually:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/crawl
```

## Local crawling (all sources, incl. scraping)

Bulk / page-by-page sources (MPSV open data, JustJoin.it, RocketJobs.pl,
StartupJobs) don't run on Vercel — run the crawler from your own machine.
Point `DATABASE_URL` in `.env` at your production (Neon) database and it feeds
the deployed app directly:

```bash
pnpm install && pnpm build
pnpm crawl                   # crawl due active preferences
pnpm crawl --force           # ignore frequency gating
pnpm crawl --match           # + AI matching afterwards (needs OPENAI_API_KEY)
pnpm crawl --source=profesia # single connector
pnpm crawl --country=sk,cz   # override the preferences' countries
pnpm crawl --max=200         # postings per source and country (default 100)
pnpm crawl --list            # list connectors, their countries and status
```

## Job sources

Each search preference picks **countries** (SK, CZ, HU, PL, DE, AT — none
selected = all) and **sources**; a source runs once per selected country it
covers. Locations are routed per country (Bratislava → SK only, Wien → AT
only; unknown places go to every country).

| Market | Sources |
|---|---|
| 🇸🇰 SK | Profesia.sk, Služby zamestnanosti (state portal, also republishes Profesia/Kariera/Worki ads), Kariera.sk, Worki.sk, StartupJobs, No Fluff Jobs |
| 🇨🇿 CZ | Úřad práce ČR open data (MPSV, ~40k)\*, Jobs.cz, Práce.cz, Jenprace.cz, Profesia.cz, StartupJobs\*, No Fluff Jobs |
| 🇭🇺 HU | Profession.hu, No Fluff Jobs |
| 🇵🇱 PL | CBOP (praca.gov.pl, state), JustJoin.it\*, RocketJobs.pl\*, Bulldogjob.pl, No Fluff Jobs |
| 🇩🇪 DE | Bundesagentur für Arbeit (Jobsuche API), Arbeitnow |
| 🇦🇹 AT | karriere.at, AMS alle jobs‡, StepStone.at‡ |
| all six | EURES (EU public employment services, incl. AMS), Jooble†, Careerjet† (+ Adzuna† for DE/AT/PL) |
| remote | Remotive, RemoteOK, We Work Remotely, Jobicy |

\* local crawler only (bulk download or one request per ad) · † free API key in `.env` ·
‡ headless browser (Playwright), local crawler only

### Crawling rules

All HTTP goes through `packages/connectors/src/http.ts`:

- **robots.txt is enforced at runtime** for every scraped URL (RFC 9309:
  most specific user-agent group, longest match, `Crawl-delay` honoured;
  unreachable robots.txt → don't crawl). A disallowed path is reported as an
  error for that source, never fetched.
- Honest user agent `JobbiqBot/0.2`, per-host rate limit with jitter
  (1–3 s depending on the site), retries with backoff on 429/5xx
  (`Retry-After` honoured), timeouts.
- The browser connectors follow the same rules: robots.txt is checked for
  every page they open, JSON the page loads in the background is only used
  if robots.txt allows that URL too, the UA is `HeadlessChrome … JobbiqBot`,
  and a bot wall (403/429 or a challenge page) ends the run — no stealth
  plugins, proxies or CAPTCHA solving.
- Where a site's API or search is robots-disallowed we use what *is* allowed:
  JustJoin.it / RocketJobs / StartupJobs via their sitemaps + offer pages,
  No Fluff Jobs via server-rendered pages, Kariera.sk via listing pages
  (its `?q=` search is disallowed).

Deliberately **not** supported — they block bots (Cloudflare / Akamai /
DataDome) or forbid it in their terms: Pracuj.pl, theprotocol.it, OLX,
StepStone.de, Indeed, LinkedIn, XING, Monster, praca.sme.sk. A headless
browser doesn't change that — they detect it, and getting past them would
mean evading the block.

HTML parsers are keyed on detail-link URL patterns (which carry the ad ID)
rather than CSS classes, so they survive most redesigns. Offline tests:
`pnpm test`.

## Deploying to Vercel

1. Import the repo; set **Root Directory** to `apps/web` (install/build commands
   come from `apps/web/vercel.json`, which builds workspace deps via Turborepo).
2. Add a Neon / Vercel Postgres database, enable the `vector` extension, and set
   `DATABASE_URL` (pooled connection string).
3. Set env vars: `AUTH_SECRET`, `CRON_SECRET`, `OPENAI_API_KEY`, optionally
   `ADZUNA_APP_ID`/`ADZUNA_APP_KEY`, `JOOBLE_API_KEY`, `CAREERJET_API_KEY`.
4. Run migrations against the production DB:
   `DATABASE_URL=... pnpm --filter @jobbiq/db migrate:deploy`
5. The daily cron (`/api/cron/crawl`) is registered from `vercel.json`;
   Vercel authenticates it with `CRON_SECRET` automatically.
