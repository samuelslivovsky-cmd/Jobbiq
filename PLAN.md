# Jobbiq — Plán implementácie

Servis na vyhľadávanie pracovných inzerátov z rôznych webov a (polo)automatické
aplikovanie na ne. Používateľ si nastaví parametre vyhľadávania, systém z jeho CV
extrahuje všetky dôležité informácie a ku každej aplikácii vygeneruje personalizovaný
e-mail / motivačný list.

---

## 1. Prehľad produktu

### Hlavné use-casy
1. **Onboarding:** používateľ nahrá CV (PDF/DOCX) → systém z neho vytiahne štruktúrovaný
   profil (skills, prax, vzdelanie, jazyky, certifikáty, kontakty).
2. **Nastavenie vyhľadávania:** kľúčové slová, pozícia, lokalita, remote/hybrid/on-site,
   typ úväzku, seniorita, mzdové rozpätie, zdroje (portály), frekvencia kontroly.
3. **Agregácia inzerátov:** systém periodicky sťahuje inzeráty z viacerých portálov,
   normalizuje ich do jednotného formátu a deduplikuje.
4. **Matching:** každý inzerát dostane skóre zhody s profilom používateľa (0–100)
   + krátke zdôvodnenie (čo sedí, čo chýba).
5. **Aplikovanie:** k vybranému inzerátu sa vygeneruje e-mail / cover letter šitý na mieru
   (inzerát × CV). Používateľ ho schváli (review queue) alebo povolí semi-auto režim.
6. **Tracking:** história aplikácií, stavy (odoslané / odpoveď / pohovor / zamietnuté),
   notifikácie o nových zhodách.

### Režimy aplikovania
- **Draft-for-review (default):** systém pripraví e-mail, používateľ ho pred odoslaním
  schváli/upraví.
- **Semi-auto:** automatické odoslanie pre inzeráty nad prahom skóre, s denným limitom.
- **Form autofill (neskoršia fáza):** predvyplnenie formulárov portálov cez Playwright,
  finálny submit vždy potvrdzuje používateľ (CAPTCHA + ToS).

---

## 2. Technologický stack (odporúčanie)

Aplikácia beží na **Verceli** — žiadne dlho bežiace procesy (workery, samostatný
API server). Všetko hostuje Next.js aplikácia: UI, API route handlery aj
naplánované joby cez Vercel Cron.

| Vrstva | Voľba | Dôvod |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | jeden jazyk (TypeScript) naprieč celým stackom |
| Aplikácia | Next.js (App Router) + Tailwind, deploy na Vercel | UI + API routes + cron handlery v jednom deployi |
| DB | Neon / Vercel Postgres + Prisma | serverless Postgres s `pgvector` na embeddingy |
| Scheduler | Vercel Cron → `/api/cron/*` route handlery | periodické crawly bez vlastnej infraštruktúry |
| Scraping | fetch + Cheerio (statické HTML); Playwright len mimo Vercelu | serverless limity — JS-heavy portály cez externý runner (neskoršia fáza) |
| AI | OpenAI API (`gpt-5-mini`, modely konfigurovateľné cez env) | extrakcia CV, matching rerank, generovanie e-mailov |
| Embeddingy | Voyage AI alebo open-source (bge-m3) | podobnosť profil × inzerát |
| E-mail | Gmail API / SMTP (nodemailer) cez OAuth používateľa | e-maily odchádzajú z adresy používateľa |
| Storage | Vercel Blob (CV súbory) | natívne pre Vercel, jednoduchý SDK |
| Auth | Auth.js (credentials + Google OAuth) | OAuth rovno poslúži aj na Gmail sending |

### Štruktúra monorepa
```
jobbiq/
├── apps/
│   └── web/            # Next.js: dashboard + API routes + cron handlery
├── packages/
│   ├── db/             # Prisma schéma + klient
│   ├── core/           # doménové typy, zdieľaná logika, scoring
│   ├── connectors/     # adaptéry na job portály (plugin systém)
│   ├── crawler/        # orchestrácia crawlov (volané z cron route)
│   └── ai/             # wrappery na OpenAI API (CV parser, matcher, writer)
└── docker-compose.yml  # Postgres pre lokálny vývoj
```

### Vercel špecifiká
- **Cron:** `vercel.json` registruje denný cron na `/api/cron/crawl` (Vercel Hobby povoľuje len denné crony);
  handler crawluje len preferencie, ktorým podľa `frequency` a `lastCrawledAt`
  vypršal interval. Chránené `CRON_SECRET`.
- **Limity funkcií:** crawl route má `maxDuration = 300`; ťažké scrapy
  (Playwright) sa na Verceli spúšťať nebudú — pre fázu 5+ pôjdu cez externý
  runner (napr. malý VPS/Fly.io worker alebo browserless API).
- **DB pripojenia:** používať pooled connection string (Neon pooler), Prisma
  singleton v serverless funkciách.

---

## 3. Dátový model (jadro)

```prisma
model User            { id, email, name, gmailOAuthTokens?, settings, ... }
model CvDocument      { id, userId, fileUrl, mimeType, rawText, parsedAt }
model CandidateProfile{ id, userId, fullName, headline, summary,
                        skills Json, experience Json, education Json,
                        languages Json, certifications Json, links Json,
                        embedding vector, editedByUser Boolean }
model SearchPreference{ id, userId, name, keywords[], locations[], remoteType,
                        contractTypes[], seniority[], salaryMin?, currency,
                        sources[], excludeCompanies[], frequency, active }
model JobSource       { id, key, name, type (API|SCRAPE), baseUrl, enabled, config Json }
model JobPosting      { id, sourceId, externalId, url, title, company, location,
                        remoteType?, salaryText?, description, applyEmail?,
                        applyUrl?, postedAt, fetchedAt, contentHash,   // dedup
                        embedding vector }
model Match           { id, userId, jobPostingId, preferenceId, score,
                        reasoning Json (pros/cons/missing), status
                        (NEW|SAVED|DISMISSED|APPLIED) }
model Application     { id, userId, jobPostingId, mode (MANUAL|SEMI_AUTO),
                        status (DRAFT|APPROVED|SENT|REPLIED|INTERVIEW|REJECTED|OFFER),
                        sentAt?, channel (EMAIL|PORTAL_FORM) }
model GeneratedEmail  { id, applicationId, subject, body, language,
                        modelUsed, promptVersion, userEdited Boolean }
model EmailTemplate   { id, userId, name, tone, instructions }
```

Dedup: `contentHash = hash(normalize(title + company + location))` + fuzzy porovnanie
titulov pri rovnakej firme; jeden inzerát na viacerých portáloch → jeden `JobPosting`
s viacerými zdrojovými URL.

---

## 4. Kľúčové moduly

### 4.1 CV Parsing (`packages/ai`)
1. Upload → Vercel Blob, extrakcia textu (pdf-parse / mammoth; fallback OCR pre skenované PDF).
2. OpenAI API so structured output (JSON schema) → `CandidateProfile`.
3. Používateľ profil skontroluje a doedituje v UI (parsing nie je nikdy 100 %).
4. Z profilu sa vygeneruje embedding pre matching.

### 4.2 Konektory na portály (`packages/connectors`)
Jednotné rozhranie — každý portál je plugin:

```ts
interface JobConnector {
  key: string;                       // "profesia", "adzuna", ...
  type: "api" | "scrape";
  search(params: NormalizedSearchParams): AsyncIterable<RawJobPosting>;
  fetchDetail?(externalId: string): Promise<RawJobPosting>;
}
```

Poradie implementácie (od najjednoduchších po rizikové):

| Vlna | Zdroj | Typ | Poznámka |
|---|---|---|---|
| 1 | Adzuna | oficiálne API | zadarmo API key, agreguje veľa krajín |
| 1 | Jooble | oficiálne API | agregátor, jednoduché API |
| 1 | Remotive / RemoteOK | verejné API/RSS | remote pozície |
| 2 | Profesia.sk | scraping | kľúčový SK trh; statické HTML, slušné na parsovanie |
| 2 | Kariera.sk, StartupJobs | scraping | SK/CZ trh |
| 3 | Indeed, LinkedIn | ⚠️ | ToS scraping zakazuje — len deep-linky na inzerát, nie auto-apply |

Zásady: rate-limit + jitter na doménu, cache, `robots.txt` respect, user-agent
identifikácia, retry s backoffom. Konektory sa spúšťajú z Vercel Cron route podľa `frequency`
v `SearchPreference`.

### 4.3 Matching engine (`packages/core` + `ai`)
Dvojstupňový, aby bol lacný:
1. **Filter + embedding similarity:** tvrdé filtre (lokalita, remote, úväzok, blacklist
   firiem) → kosínusová podobnosť embeddingov (pgvector) → top N kandidátov.
2. **LLM rerank:** LLM (gpt-5-mini) dostane profil + inzerát → skóre 0–100 +
   `{ pros, cons, missingSkills }`. Ukladá sa do `Match.reasoning` a zobrazuje v UI.

### 4.4 Generovanie e-mailov (`packages/ai`)
- Vstup: `CandidateProfile` + `JobPosting` + `EmailTemplate` (tón, jazyk, vlastné inštrukcie).
- Výstup: subject + body v jazyku inzerátu (SK/EN/DE…), 120–180 slov, konkrétne
  prepojenie skúseností kandidáta na požiadavky inzerátu, žiadne vymyslené fakty
  (prompt musí explicitne zakázať halucinovanie skúseností).
- Verzovanie promptov (`promptVersion`) kvôli iterácii kvality.
- CV sa prikladá ako príloha; neskôr voliteľne tailored CV export.

### 4.5 Odosielanie a aplikovanie
- **E-mail kanál:** Gmail API (OAuth) → e-mail odíde priamo z adresy používateľa,
  odpovede mu chodia normálne do schránky. Fallback: vlastné SMTP.
- **Portálové formuláre:** Playwright autofill (meno, e-mail, CV upload, cover letter),
  submit potvrdzuje používateľ. Nikdy neobchádzať CAPTCHA.
- **Limity:** denný strop odoslaní, cooldown na firmu, dedup (na jeden inzerát max 1×).

### 4.6 Scheduler + notifikácie
- Vercel Cron: denný tick na `/api/cron/crawl` (crawluje due preferencie a
  následne spustí matching pre dotknutých používateľov); denný `/api/cron/digest`
  (e-mail s novými zhodami).
- Notifikácie: e-mail digest, neskôr push/Telegram.

### 4.7 Frontend (apps/web)
- **Onboarding wizard:** upload CV → kontrola profilu → nastavenie preferencií.
- **Feed:** zoznam zhôd so skóre, pros/cons, filtre; akcie Save / Dismiss / Apply.
- **Review queue:** vygenerované e-maily na schválenie/úpravu pred odoslaním.
- **Applications:** kanban/tabuľka stavov aplikácií.
- **Settings:** preferencie, šablóny e-mailov, zdroje, limity semi-auto režimu.

---

## 5. Fázy implementácie

| Fáza | Obsah | Výstup |
|---|---|---|
| **0. Skeleton** (1 t.) | monorepo, docker-compose, Prisma schéma, auth, CI | prihlásenie + prázdny dashboard |
| **1. CV → profil** (1–2 t.) | upload, text extrakcia, AI parsing, edit UI | štruktúrovaný profil z CV |
| **2. Zdroje + feed** (2 t.) | connector rozhranie, Adzuna + Jooble + Remotive, normalizácia, dedup, preferencie, scheduler | feed reálnych inzerátov podľa preferencií |
| **3. Matching** (1 t.) | embeddingy, filter + rerank, skóre v UI | zoradený feed s odôvodnením |
| **4. Aplikovanie** (2 t.) | generovanie e-mailov, review queue, Gmail OAuth sending, tracking stavov | end-to-end aplikácia na inzerát ✅ MVP |
| **5. Automatizácia** (1–2 t.) | semi-auto režim s limitmi, denný digest, Profesia.sk + ďalšie scrape konektory | „nastav a nechaj bežať“ |
| **6. Rozšírenia** | Playwright form autofill, tailored CV export, analytika úspešnosti, ďalšie portály | |

MVP = koniec fázy 4 (~6–7 týždňov pre jedného vývojára).

---

## 6. Riziká a zásady

- **ToS/právne:** LinkedIn a Indeed scraping a auto-apply zakazujú → u nich len
  deep-link „Apply on portal“. Preferovať oficiálne API a agregátory.
- **GDPR:** CV = osobné údaje. Šifrovanie at rest, právo na vymazanie (kaskádový
  delete používateľa), dáta v EÚ regióne, žiadne zdieľanie profilov medzi používateľmi.
- **Kvalita generovaných e-mailov:** default je vždy human-in-the-loop; prompt zakazuje
  vymýšľať skúsenosti; jazyk podľa inzerátu.
- **Deliverability:** e-maily posielať z používateľovho Gmailu (OAuth), nie z vlastnej
  domény — vyhne sa spam problémom aj „impersonácii“.
- **Krehkosť scraperov:** monitoring úspešnosti crawlov (alert pri poklese počtu
  inzerátov), snapshot testy HTML parserov, konektory izolované ako pluginy.
- **Náklady na AI:** haiku na lacné kroky (klasifikácia, rerank), sonnet len na parsing
  CV a finálne e-maily; cache výsledkov (inzerát sa parsuje raz, nie pri každom matchi).
