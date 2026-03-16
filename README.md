# Growth Automation Engine

A production-grade automation system that discovers startups, scrapes founder data, enriches contact information, and generates personalised outreach emails.

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
                   │ (Puppeteer) │  │(Hunter.io│  │(Template) │
                   └─────────────┘  └──────────┘  └───────────┘
                                          │
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
│   │   ├── scraperService.ts     # Google search scraper (Puppeteer)
│   │   ├── enrichmentService.ts  # Hunter.io email enrichment
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

| Variable        | Description                              |
|-----------------|------------------------------------------|
| `PORT`          | HTTP server port (default: `3000`)       |
| `DATABASE_URL`  | PostgreSQL connection string             |
| `REDIS_HOST`    | Redis host (default: `localhost`)        |
| `REDIS_PORT`    | Redis port (default: `6379`)             |
| `HUNTER_API_KEY`| Hunter.io API key for email enrichment  |

### 3. Database Setup

```bash
psql -U <user> -d <database> -f database/init.sql
```

Or the leads table is created automatically on first run via `initLeadsTable()`.

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
ts-node src/workers/scrapeWorker.ts
```

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

---

## CLI Usage

```bash
npm run discover "fintech startups"
npm run discover "developer tools"
```

This runs the complete pipeline synchronously:
1. Discovers startups from Product Hunt
2. Scrapes founder data via Google
3. Enriches emails via Hunter.io
4. Saves leads to PostgreSQL

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