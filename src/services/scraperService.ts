/**
 * services/scraperService.ts - Founder Data Scraper
 *
 * Given a startup name, uses Puppeteer to perform a Google search and
 * attempts to extract structured founder / company information from
 * the search result snippets and knowledge panel.
 */

import puppeteer, { Browser } from 'puppeteer';

export interface ScrapedFounderData {
  founderName: string;
  website: string;
  linkedin: string;
  twitter: string;
  company: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Safely parses a URL and returns its hostname, or an empty string on failure.
 */
function parseHostname(href: string): string {
  try {
    return new URL(href).hostname;
  } catch {
    return '';
  }
}

/**
 * Extracts the first LinkedIn URL found in the given list of href strings.
 * Matches only on the exact hostname (e.g. "linkedin.com" or "www.linkedin.com").
 */
function extractLinkedIn(hrefs: string[]): string {
  return hrefs.find((h) => {
    const host = parseHostname(h);
    return host === 'linkedin.com' || host.endsWith('.linkedin.com');
  }) ?? '';
}

/**
 * Extracts the first Twitter / X URL found in the given list of href strings.
 * Matches only on the exact hostname to avoid false positives.
 */
function extractTwitter(hrefs: string[]): string {
  return hrefs.find((h) => {
    const host = parseHostname(h);
    return host === 'twitter.com' || host.endsWith('.twitter.com') ||
           host === 'x.com' || host.endsWith('.x.com');
  }) ?? '';
}

/**
 * Returns the first href that is not a well-known non-company URL and looks
 * like a public website. Checks are performed against the parsed hostname.
 */
function extractWebsite(hrefs: string[]): string {
  const excludedHosts = ['google.com', 'youtube.com', 'facebook.com', 'accounts.google.com'];
  return (
    hrefs.find((h) => {
      if (!h.startsWith('http')) return false;
      const host = parseHostname(h);
      if (!host) return false;
      return !excludedHosts.some((ex) => host === ex || host.endsWith(`.${ex}`));
    }) ?? ''
  );
}

// ─── Scraper ──────────────────────────────────────────────────────────────────

/**
 * Scrapes Google search results to retrieve public founder / company data
 * for a given startup name.
 *
 * @param startupName - The name of the startup to look up
 * @returns Structured founder data (fields may be empty strings if not found)
 */
export async function scrapeStartupData(startupName: string): Promise<ScrapedFounderData> {
  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    );

    const query = encodeURIComponent(`${startupName} founder CEO LinkedIn`);
    const url = `https://www.google.com/search?q=${query}`;

    console.log(`[Scraper] Searching for: ${startupName}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });

    // Collect all hyperlinks from the SERP page
    const hrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]')).map((a) => (a as HTMLAnchorElement).href),
    );

    // Extract snippet text that might contain a founder name
    const snippetText = await page.evaluate(() => {
      const snippets = Array.from(document.querySelectorAll('span, div'))
        .map((el) => el.textContent?.trim() ?? '')
        .filter((t) => t.toLowerCase().includes('founder') || t.toLowerCase().includes('ceo'));
      return snippets.slice(0, 3).join(' ');
    });

    // Heuristically derive a founder name from snippet text
    const founderMatch = snippetText.match(/(?:founder|ceo)[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)/i);
    const founderName = founderMatch ? founderMatch[1] : '';

    const result: ScrapedFounderData = {
      company: startupName,
      founderName,
      website: extractWebsite(hrefs),
      linkedin: extractLinkedIn(hrefs),
      twitter: extractTwitter(hrefs),
    };

    console.log(`[Scraper] Result for "${startupName}":`, result);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Scraper] Error scraping "${startupName}": ${message}`);
    return {
      company: startupName,
      founderName: '',
      website: '',
      linkedin: '',
      twitter: '',
    };
  } finally {
    if (browser) await browser.close();
  }
}
