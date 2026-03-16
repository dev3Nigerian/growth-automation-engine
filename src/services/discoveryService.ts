/**
 * services/discoveryService.ts - Lead Discovery via Product Hunt
 *
 * Uses Puppeteer to scrape the Product Hunt topics page for a given keyword
 * and extracts startup names from the listing.
 *
 * Includes exponential-back-off retry logic for resilience against
 * transient network or rendering failures.
 */

import puppeteer, { Browser } from 'puppeteer';

export interface DiscoveredStartup {
  name: string;
}

// ─── Retry Helper ─────────────────────────────────────────────────────────────

/**
 * Retries an async function with exponential back-off.
 * @param fn      - Async operation to attempt
 * @param retries - Maximum number of retry attempts (default: 3)
 * @param delay   - Initial delay in ms between retries (doubles each attempt)
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000,
): Promise<T> {
  let lastError: Error = new Error('Unknown error');
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[Discovery] Attempt ${attempt}/${retries} failed: ${lastError.message}`);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delay * attempt));
      }
    }
  }
  throw lastError;
}

// ─── Discovery ────────────────────────────────────────────────────────────────

/**
 * Scrapes Product Hunt for startups related to the given topic.
 *
 * @param topic - Industry or keyword to search for (e.g. "AI startups")
 * @returns     Array of discovered startup names
 */
export async function discoverStartups(topic: string): Promise<DiscoveredStartup[]> {
  return withRetry(async () => {
    let browser: Browser | null = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();

      // Set a realistic user-agent to reduce bot-detection risk
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      );

      const encoded = encodeURIComponent(topic);
      const url = `https://www.producthunt.com/search?q=${encoded}`;
      console.log(`[Discovery] Navigating to: ${url}`);

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });

      // Extract post titles from Product Hunt search results
      const startups = await page.evaluate(() => {
        const items: { name: string }[] = [];

        // Product Hunt search results use data-test="post-name" or heading tags
        const headings = document.querySelectorAll('[data-test="post-name"], h3');
        headings.forEach((el) => {
          const text = el.textContent?.trim();
          if (text) items.push({ name: text });
        });

        return items.slice(0, 20); // cap at 20 results per search
      });

      console.log(`[Discovery] Found ${startups.length} startups for topic: "${topic}"`);
      return startups;
    } finally {
      if (browser) await browser.close();
    }
  });
}
