/**
 * scripts/runDiscovery.ts - CLI Runner for Lead Discovery
 *
 * Usage:
 *   npm run discover "AI startups"
 *   ts-node scripts/runDiscovery.ts "fintech"
 *
 * Runs the full discovery → scrape → enrich → save pipeline
 * synchronously for the given topic, writing results to the console.
 */

import dotenv from 'dotenv';
dotenv.config();

import { discoverStartups } from '../src/services/discoveryService';
import { processSingleStartup } from '../src/controllers/leadController';
import { initLeadsTable } from '../src/models/leadModel';

async function main(): Promise<void> {
  const topic = process.argv[2];

  if (!topic) {
    console.error('Usage: npm run discover "<topic>"');
    console.error('Example: npm run discover "AI startups"');
    process.exit(1);
  }

  console.log(`\n🚀 Growth Automation Engine – Discovery Run`);
  console.log(`Topic: "${topic}"\n`);

  // Ensure the leads table exists before we start
  await initLeadsTable();

  // Step 1 – Discover startups
  console.log('Step 1: Discovering startups...');
  const discovered = await discoverStartups(topic);
  console.log(`  Found ${discovered.length} startups\n`);

  if (discovered.length === 0) {
    console.log('No startups discovered. Exiting.');
    process.exit(0);
  }

  // Step 2–4 – Scrape, enrich, and save each startup
  console.log('Step 2-4: Scraping, enriching, and saving leads...');
  let saved = 0;

  for (const startup of discovered) {
    try {
      await processSingleStartup(startup.name, topic);
      saved++;
      console.log(`  ✓ Processed: ${startup.name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`  ✗ Failed to process "${startup.name}": ${message}`);
    }
  }

  console.log(`\n✅ Discovery complete. Leads saved: ${saved}/${discovered.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
