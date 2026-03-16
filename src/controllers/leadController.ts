/**
 * controllers/leadController.ts - Lead Discovery Workflow Controller
 *
 * Orchestrates the full lead-generation pipeline:
 *  1. Discover startups from Product Hunt for the given topic
 *  2. Scrape founder/company data for each startup
 *  3. Enrich contact data using Hunter.io
 *  4. Persist qualified leads to the database
 *
 * Returns a summary count of leads collected.
 */

import { Request, Response } from 'express';
import { discoverStartups } from '../services/discoveryService';
import { scrapeStartupData } from '../services/scraperService';
import { findEmail } from '../services/enrichmentService';
import { createLead, findLeadByEmail } from '../models/leadModel';
import { addScrapeJob } from '../queues/scrapeQueue';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiscoverRequestBody {
  topic: string;
}

// ─── Controller ───────────────────────────────────────────────────────────────

/**
 * POST /api/discover
 *
 * Body: { topic: string }
 * Response: { leadsCollected: number }
 *
 * Enqueues scraping jobs for each discovered startup so the heavy Puppeteer
 * work happens asynchronously via BullMQ workers. Returns immediately with
 * the count of jobs queued.
 */
export async function discoverLeads(req: Request, res: Response): Promise<void> {
  const { topic } = req.body as DiscoverRequestBody;

  if (!topic || typeof topic !== 'string' || topic.trim() === '') {
    res.status(400).json({ error: '`topic` is required and must be a non-empty string' });
    return;
  }

  try {
    console.log(`[Controller] Starting discovery for topic: "${topic}"`);

    // Step 1 – Discover startup names from Product Hunt
    const discovered = await discoverStartups(topic.trim());
    console.log(`[Controller] Discovered ${discovered.length} startups`);

    // Step 2 – Enqueue a scrape job for each startup (async processing)
    let leadsCollected = 0;
    for (const startup of discovered) {
      await addScrapeJob({ startupName: startup.name, topic: topic.trim() });
      leadsCollected++;
    }

    res.json({ leadsCollected });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Controller] discoverLeads error:', message);
    res.status(500).json({ error: 'Discovery pipeline failed', details: message });
  }
}

/**
 * Synchronous (non-queued) version used internally by the scrape worker.
 * Scrapes, enriches, and persists a single startup.
 *
 * @param startupName - Name of the startup to process
 * @param topic       - The original topic used as the `industry` field
 */
export async function processSingleStartup(startupName: string, topic: string): Promise<void> {
  // Step 2 – Scrape founder / company data
  const scraped = await scrapeStartupData(startupName);

  // Step 3 – Attempt to enrich email via Hunter.io
  let email = '';
  if (scraped.website) {
    try {
      const domain = new URL(scraped.website).hostname;
      email = (await findEmail(scraped.founderName, domain)) ?? '';
    } catch {
      // URL parse failed – skip enrichment
    }
  }

  // Skip saving if the lead already exists (idempotency)
  if (email) {
    const existing = await findLeadByEmail(email);
    if (existing) {
      console.log(`[Controller] Lead already exists for email: ${email}`);
      return;
    }
  }

  // Step 4 – Persist lead
  await createLead({
    name: scraped.founderName || startupName,
    company: scraped.company,
    email,
    linkedin: scraped.linkedin,
    twitter: scraped.twitter,
    website: scraped.website,
    industry: topic,
    source: 'product_hunt',
  });

  console.log(`[Controller] Lead saved for: ${startupName}`);
}
