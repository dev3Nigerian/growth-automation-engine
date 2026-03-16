/**
 * workers/scrapeWorker.ts - BullMQ Scrape Worker
 *
 * Processes jobs from the `scrape` queue.
 * For each job it runs the full scrape → enrich → save pipeline
 * for a single startup using `processSingleStartup`.
 *
 * Start this worker independently (e.g. `ts-node src/workers/scrapeWorker.ts`)
 * so that scraping is decoupled from the HTTP request lifecycle.
 */

import dotenv from 'dotenv';
dotenv.config();

import { Worker, Job } from 'bullmq';
import { getRedisConnection } from '../config/redis';
import { ScrapeJobData } from '../queues/scrapeQueue';
import { processSingleStartup } from '../controllers/leadController';

const worker = new Worker<ScrapeJobData>(
  'scrape',
  async (job: Job<ScrapeJobData>) => {
    const { startupName, topic } = job.data;
    console.log(`[Worker] Processing job ${job.id}: ${startupName}`);
    await processSingleStartup(startupName, topic);
    console.log(`[Worker] Completed job ${job.id}: ${startupName}`);
  },
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connection: getRedisConnection() as any,
    concurrency: 3, // process up to 3 scraping jobs simultaneously
  },
);

// ─── Worker Event Listeners ───────────────────────────────────────────────────

worker.on('completed', (job: Job<ScrapeJobData>) => {
  console.log(`[Worker] Job ${job.id} completed successfully`);
});

worker.on('failed', (job: Job<ScrapeJobData> | undefined, err: Error) => {
  console.error(`[Worker] Job ${job?.id ?? 'unknown'} failed:`, err.message);
});

worker.on('error', (err: Error) => {
  console.error('[Worker] Worker error:', err.message);
});

console.log('[Worker] Scrape worker started and listening for jobs...');

export default worker;
