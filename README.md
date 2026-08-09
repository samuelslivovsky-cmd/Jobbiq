# Jobbiq

Job search & apply automation: aggregates job postings from multiple sources,
matches them against a candidate profile extracted from your CV, and generates
personalized application emails. See [PLAN.md](./PLAN.md) for the full roadmap.

## Structure

```
apps/
  web/          Next.js dashboard (Auth.js credentials login)
  api/          NestJS REST API
packages/
  db/           Prisma schema + client (PostgreSQL + pgvector)
  core/         Domain types, zod schemas, dedup hashing
  connectors/   Job source adapters (Adzuna, Remotive, ...)
  ai/           Claude API wrappers (CV parsing, email generation)
  workers/      BullMQ workers (crawling)
```

## Getting started

```bash
pnpm install
cp .env.example .env          # fill in secrets
docker compose up -d          # Postgres + Redis + MinIO
pnpm db:migrate               # create DB schema
pnpm build
pnpm dev                      # web on :3000, api on :4000
```

## Environment

See `.env.example`. Required for full functionality:

- `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`
- `ANTHROPIC_API_KEY` — CV parsing + email generation
- `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` — Adzuna connector (free at developer.adzuna.com)
