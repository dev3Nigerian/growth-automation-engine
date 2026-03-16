/**
 * queues/scrapeQueue.ts - BullMQ Scrape Job Queue
 *
 * Defines the `scrape` queue backed by Redis and provides a helper
 * to enqueue new scraping jobs.
 */

import { Queue } from 'bullmq';
import { getRedisConnection } from '../config/redis';

export interface ScrapeJobData {
  startupName: string;
  topic: string;
}

// Lazily-initialised queue instance (shared singleton)
let scrapeQueue: Queue | null = null;

/**
 * Returns the singleton scrape queue, creating it on first call.
 */
export function getScrapeQueue(): Queue {
  if (!scrapeQueue) {
    scrapeQueue = new Queue('scrape', {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: 100, // keep last 100 failed jobs for inspection
      },
    });
    console.log('[Queue] Scrape queue initialised');
  }
  return scrapeQueue;
}

/**
 * Adds a startup scraping job to the queue.
 *
 * @param data - Job payload containing startupName and topic
 */
export async function addScrapeJob(data: ScrapeJobData): Promise<void> {
  const queue = getScrapeQueue();
  await queue.add('scrape-startup', data);
  console.log(`[Queue] Enqueued scrape job for: ${data.startupName}`);
}
