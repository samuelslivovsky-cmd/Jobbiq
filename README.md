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

Scraping connectors (Profesia.sk) don't run on Vercel — run the crawler from
your own machine instead. Point `DATABASE_URL` in `.env` at your production
(Neon) database and it feeds the deployed app directly:

```bash
pnpm install && pnpm build
pnpm crawl                   # crawl due active preferences
pnpm crawl --force           # ignore frequency gating
pnpm crawl --match           # + AI matching afterwards (needs OPENAI_API_KEY)
pnpm crawl --source=profesia # single connector
pnpm crawl --max=200         # postings per source (default 100)
```

Sources: Profesia.sk (scrape), Adzuna*, Jooble*, Remotive, RemoteOK,
We Work Remotely, Arbeitnow, Jobicy — `*` needs a free API key in `.env`.

## Deploying to Vercel

1. Import the repo; set **Root Directory** to `apps/web` (install/build commands
   come from `apps/web/vercel.json`, which builds workspace deps via Turborepo).
2. Add a Neon / Vercel Postgres database, enable the `vector` extension, and set
   `DATABASE_URL` (pooled connection string).
3. Set env vars: `AUTH_SECRET`, `CRON_SECRET`, `OPENAI_API_KEY`,
   `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`.
4. Run migrations against the production DB:
   `DATABASE_URL=... pnpm --filter @jobbiq/db migrate:deploy`
5. The daily cron (`/api/cron/crawl`) is registered from `vercel.json`;
   Vercel authenticates it with `CRON_SECRET` automatically.
