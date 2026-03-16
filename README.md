# Growth Automation Engine

A production-grade automation system that discovers startups, scrapes founder data, enriches contact information, scores leads with AI, and generates personalised outreach emails.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          HTTP Clients / CLI                         │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ POST /api/discover
                    ┌────────────▼────────────┐
                    │    Express API Server    │
                    │      src/app.ts          │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    Lead Controller       │
                    │ src/controllers/         │
                    └──┬───────────────────┬──┘
                       │                   │
           ┌───────────▼──┐        ┌───────▼──────────┐
           │  Discovery   │        │   BullMQ Queue   │
           │  Service     │        │  (scrapeQueue)   │
           │  (Puppeteer) │        └───────┬──────────┘
           └──────────────┘                │
                                   ┌───────▼──────────┐
                                   │  Scrape Worker   │
                                   │  src/workers/    │
                                   └───────┬──────────┘
                              ┌────────────┼────────────┐
                              │            │            │
                       ┌──────────▼──┐  ┌──────▼───┐  ┌────▼──────┐
                       │  Scraper    │  │Enrichment│  │ Outreach  │
                       │  Service    │  │ Service  │  │ Service   │
                       │ (DuckDuckGo │  │(Hunter.io│  │(Template) │
                       │ + Website)  │  └──────┬───┘  └───────────┘
                       └──────┬──────┘         │
                         │         ┌──────▼──────┐
                         │         │ AI Scoring  │
                         │         │   Service   │
                         │         │  (Ollama)   │
                         │         └──────┬──────┘
                         │                │
                              ┌───────────▼────────────┐
                              │     PostgreSQL DB       │
                              │   src/models/           │
                              └────────────────────────┘
```

### Folder Structure

```
growth-automation-engine/
├── src/
│   ├── app.ts                    # Express server entry point
│   ├── config/
│   │   ├── database.ts           # PostgreSQL connection pool
│   │   └── redis.ts              # Redis/ioredis connection
│   ├── controllers/
│   │   └── leadController.ts     # POST /discover + pipeline orchestration
│   ├── models/
│   │   └── leadModel.ts          # Lead CRUD (createLead, findLeadByEmail, listLeads)
│   ├── queues/
│   │   └── scrapeQueue.ts        # BullMQ queue definition + job helper
│   ├── routes/
│   │   └── leadRoutes.ts         # Express router
│   ├── services/
│   │   ├── discoveryService.ts   # Product Hunt scraper (Puppeteer)
│   │   ├── scraperService.ts     # DuckDuckGo + website fallback scraper
│   │   ├── enrichmentService.ts  # Hunter.io email enrichment
│   │   ├── leadScoringService.ts # Ollama-based lead scoring
│   │   └── outreachService.ts    # Outreach email generator
│   └── workers/
│       └── scrapeWorker.ts       # BullMQ worker process
├── scripts/
│   └── runDiscovery.ts           # CLI runner
├── database/
│   └── init.sql                  # Schema DDL
├── .env.example                  # Environment variable template
├── package.json
└── tsconfig.json
```

---

## Setup Instructions

### Prerequisites

- Node.js ≥ 18
- PostgreSQL ≥ 14
- Redis ≥ 6
- Optional: access to an Ollama-compatible chat endpoint for lead scoring

### 1. Clone & Install

```bash
git clone https://github.com/dev3Nigerian/growth-automation-engine.git
cd growth-automation-engine
npm install
```

### 2. Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Description |
|----------|-------------|
| `PORT` | HTTP server port (default: `3000`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_HOST` | Redis host (default: `localhost`) |
| `REDIS_PORT` | Redis port (default: `6379`) |
| `HUNTER_API_KEY` | Hunter.io API key for email enrichment |
| `OLLAMA_MODEL` | Model name sent to the Ollama-compatible chat endpoint |
| `OLAMA_API_URL` | Hosted Ollama-compatible chat URL, for example `https://ollama.com/api/chat` |
| `OLAMA_API_KEY` | Bearer token for the hosted Ollama-compatible API |
| `OLLAMA_BASE_URL` | Local Ollama base URL fallback when `OLAMA_API_URL` is not set |

Notes:

- The scoring service first checks `OLAMA_API_URL` and `OLAMA_API_KEY`.
- If no hosted API URL is configured, it falls back to `OLLAMA_BASE_URL` and calls `/api/chat` locally.
- If scoring fails, the lead pipeline still continues and saves the lead without a score.

### 3. Database Setup

```bash
psql -U <user> -d <database> -f database/init.sql
```

Or let the app initialise the schema on startup. The `leads` table now includes AI scoring fields:

- `score` - numeric score from `1` to `100`
- `score_reason` - short rationale returned by the scoring model

### 4. Build

```bash
npm run build
```

### 5. Run

**Development (with hot reload):**

```bash
npm run dev
```

**Production:**

```bash
npm start
```

**Worker (in a separate terminal):**

```bash
npx ts-node src/workers/scrapeWorker.ts
```

**CLI discovery run:**

```bash
npm run discover "AI startups"
```

The CLI runner creates missing lead table columns automatically before processing.

---

## API Reference

### Health Check

```
GET /health
```

**Response:**
```json
{ "status": "ok" }
```

### Discover Leads

```
POST /api/discover
Content-Type: application/json

{
  "topic": "AI startups"
}
```

**Response:**
```json
{ "leadsCollected": 15 }
```

This endpoint queues discovery jobs. Scraping, enrichment, scoring, and persistence happen in the worker.

---

## CLI Usage

```bash
npm run discover "fintech startups"
npm run discover "developer tools"
```

This runs the complete pipeline synchronously:
1. Discovers startups from Product Hunt
2. Scrapes founder data via DuckDuckGo search plus a best-effort website crawl
3. Enriches emails via Hunter.io
4. Scores each lead with an Ollama-compatible chat model
5. Saves leads to PostgreSQL

## Lead Quality

The pipeline applies a few guardrails before saving leads:

- Discovery filters Product Hunt category labels and other non-product headings.
- Scraping skips rows with no meaningful company or founder data.
- Hunter lookups only run when the founder name looks like a real person name.
- Website selection prefers likely company domains over media sites, directories, and profile aggregators.

## Scoring Output

Saved leads now include:

- `score`: integer score between `1` and `100`
- `score_reason`: short model-generated explanation

If you inspect the database directly, for example in `psql`, you can query:

```sql
SELECT id, company, name, email, score, score_reason
FROM leads
ORDER BY created_at DESC
LIMIT 20;
```

---

## Example Outreach Email

```
Subject: Quick note about Acme Corp

Hi John,

I came across Acme Corp while researching companies in AI startups.

Would love to connect and learn more about what you're building.

Best,
Faithful
```

---

## License

MIT