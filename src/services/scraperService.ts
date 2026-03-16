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

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface WebsiteSignals {
  founderName: string;
  linkedin: string;
  twitter: string;
}

const FOUNDER_STOP_WORDS = new Set([
  'and',
  'at',
  'of',
  'an',
  'as',
  'the',
  'former',
  'original',
  'launches',
  'inside',
  'parallel',
]);

const WEBSITE_EXCLUDED_HOSTS = [
  'duckduckgo.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'facebook.com',
  'instagram.com',
  'youtube.com',
  'craft.co',
  'theorg.com',
  'crunchbase.com',
  'cbinsights.com',
  'wikipedia.org',
  'forbes.com',
  'ycombinator.com',
  'linktr.ee',
  'technologymagazine.com',
  'techcrunch.com',
  'medium.com',
  'substack.com',
];

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

function normalizeUrl(href: string): string {
  try {
    const url = new URL(href);
    if (url.hostname.includes('duckduckgo.com')) {
      const redirected = url.searchParams.get('uddg');
      if (redirected) {
        return decodeURIComponent(redirected);
      }
    }

    return url.toString();
  } catch {
    return href;
  }
}

function sameRegistrableDomain(candidateUrl: string, websiteUrl: string): boolean {
  const normalizeHost = (href: string) => parseHostname(href).replace(/^www\./, '').toLowerCase();

  const candidateHost = normalizeHost(candidateUrl);
  const websiteHost = normalizeHost(websiteUrl);

  if (!candidateHost || !websiteHost) {
    return false;
  }

  return candidateHost === websiteHost || candidateHost.endsWith(`.${websiteHost}`);
}

function normaliseCompanyTokens(startupName: string): string[] {
  return startupName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function cleanFounderCandidate(candidate: string, startupName: string): string {
  const startupTokens = new Set(normaliseCompanyTokens(startupName));
  const normalized = candidate
    .replace(/[|,:;()[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return '';
  }

  const words = normalized.split(' ');
  if (words.length < 2 || words.length > 4) {
    return '';
  }

  const firstWord = words[0].toLowerCase();
  if (FOUNDER_STOP_WORDS.has(firstWord)) {
    return '';
  }

  const hasBlockedKeyword = words.some((word) => {
    const lowered = word.toLowerCase();
    return [
      'founder',
      'co-founder',
      'ceo',
      'chief',
      'executive',
      'officer',
      'startup',
      'company',
      'google',
      'uber',
    ].includes(lowered);
  });

  if (hasBlockedKeyword) {
    return '';
  }

  const containsCompanyToken = words.some((word) => startupTokens.has(word.toLowerCase()));
  if (containsCompanyToken) {
    return '';
  }

  const looksLikeName = words.every((word) => /^[A-Z][a-z'’-]+$/.test(word));
  return looksLikeName ? normalized : '';
}

function extractNameFromTitle(title: string, startupName: string): string {
  const segments = title.split(/\s+[|\-]\s+/).map((segment) => segment.trim()).filter(Boolean);
  for (const segment of segments) {
    const cleaned = cleanFounderCandidate(segment, startupName);
    if (cleaned) {
      return cleaned;
    }
  }

  return '';
}

function normalizeWebsiteUrl(href: string): string {
  try {
    const url = new URL(href);
    return url.origin;
  } catch {
    return href;
  }
}

function scoreWebsiteCandidate(href: string, startupName: string): number {
  const host = parseHostname(href).replace(/^www\./, '').toLowerCase();
  if (!host) {
    return -100;
  }

  if (WEBSITE_EXCLUDED_HOSTS.some((excluded) => host === excluded || host.endsWith(`.${excluded}`))) {
    return -100;
  }

  const companyTokens = normaliseCompanyTokens(startupName);
  let path = '/';

  try {
    path = new URL(href).pathname.toLowerCase();
  } catch {
    return -100;
  }

  let score = 0;

  if (companyTokens.some((token) => host.includes(token))) {
    score += 10;
  }

  if (path === '/' || path === '') {
    score += 4;
  }

  if (/^\/(about|company|team|leadership|home)?\/?$/.test(path)) {
    score += 2;
  }

  if (/\/(blog|news|post|posts|article|author|country|profile|people|person)\b/.test(path)) {
    score -= 4;
  }

  if (/^\/[a-z0-9-]+$/.test(path) && companyTokens.some((token) => path.includes(token))) {
    score += 1;
  }

  return score;
}

/**
 * Extracts the first LinkedIn URL found in the given list of href strings.
 * Matches only on the exact hostname (e.g. "linkedin.com" or "www.linkedin.com").
 */
function extractLinkedIn(hrefs: string[]): string {
  return hrefs.find((h) => {
    const host = parseHostname(h);
    if (!(host === 'linkedin.com' || host.endsWith('.linkedin.com'))) {
      return false;
    }

    return h.includes('/in/') || h.includes('/company/');
  }) ?? '';
}

/**
 * Extracts the first Twitter / X URL found in the given list of href strings.
 * Matches only on the exact hostname to avoid false positives.
 */
function extractTwitter(hrefs: string[]): string {
  return hrefs.find((h) => {
    const host = parseHostname(h);
    if (!(host === 'twitter.com' || host.endsWith('.twitter.com') ||
           host === 'x.com' || host.endsWith('.x.com'))) {
      return false;
    }

    return !h.includes('/search?') && !h.includes('/home');
  }) ?? '';
}

/**
 * Returns the first href that is not a well-known non-company URL and looks
 * like a public website. Checks are performed against the parsed hostname.
 */
function extractWebsite(hrefs: string[], startupName: string): string {
  const candidates = hrefs
    .filter((href) => href.startsWith('http'))
    .map((href) => ({ href, score: scoreWebsiteCandidate(href, startupName) }))
    .filter((candidate) => candidate.score > -100)
    .sort((left, right) => right.score - left.score);

  return candidates[0] ? normalizeWebsiteUrl(candidates[0].href) : '';
}

function extractFounderName(results: SearchResult[], startupName: string): string {
  for (const result of results) {
    const href = normalizeUrl(result.url);
    if (href.includes('linkedin.com/in/')) {
      const titleName = extractNameFromTitle(result.title, startupName);
      if (titleName) {
        return titleName;
      }
    }

    if (/crunchbase|theorg|craft\.co/i.test(href)) {
      const titleName = extractNameFromTitle(result.title, startupName);
      if (titleName) {
        return titleName;
      }
    }
  }

  const texts = results.map((result) => `${result.title} ${result.snippet}`.trim());
  return extractFounderNameFromTexts(texts, startupName);
}

function extractFounderNameFromTexts(texts: string[], startupName: string): string {
  const escapedStartup = startupName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`${escapedStartup}['’]s founder is ([A-Z][a-z]+(?: [A-Z][a-z]+)+)`, 'i'),
    new RegExp(`${escapedStartup}.*?founded by ([A-Z][a-z]+(?: [A-Z][a-z]+)+)`, 'i'),
    new RegExp(`founder(?: and ceo)? of ${escapedStartup}[^A-Za-z]+([A-Z][a-z]+(?: [A-Z][a-z]+)+)`, 'i'),
    new RegExp(`([A-Z][a-z]+(?: [A-Z][a-z]+)+) is the (?:ceo|founder|co-founder) of ${escapedStartup}`, 'i'),
    new RegExp(`([A-Z][a-z]+(?: [A-Z][a-z]+)+),? (?:founder|co-founder|ceo) of ${escapedStartup}`, 'i'),
    /(?:founder|co-founder|ceo|chief executive officer)[:\s-]+([A-Z][a-z]+(?: [A-Z][a-z]+)+)/i,
    /founded by\s+([A-Z][a-z]+(?: [A-Z][a-z]+)+)/i,
    /([A-Z][a-z]+(?: [A-Z][a-z]+)+)\s+-\s+Founder\s+@/i,
  ];

  for (const text of texts) {
    const normalizedText = text.replace(/\s+/g, ' ').trim();
    if (!normalizedText) {
      continue;
    }

    for (const pattern of patterns) {
      const match = normalizedText.match(pattern);
      if (match?.[1]) {
        const cleaned = cleanFounderCandidate(match[1].trim(), startupName);
        if (cleaned) {
          return cleaned;
        }
      }
    }
  }

  return '';
}

async function extractWebsiteSignals(browser: Browser, website: string, startupName: string): Promise<WebsiteSignals> {
  const visited = new Set<string>();
  const hrefs: string[] = [];
  const textSamples: string[] = [];
  const pagesToVisit = [website];

  while (pagesToVisit.length > 0 && visited.size < 3) {
    const nextUrl = pagesToVisit.shift();
    if (!nextUrl || visited.has(nextUrl)) {
      continue;
    }

    visited.add(nextUrl);
    const page = await browser.newPage();

    try {
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      );
      await page.goto(nextUrl, { waitUntil: 'networkidle2', timeout: 20_000 });

      const pageData = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href]')).map((anchor) => ({
          href: (anchor as HTMLAnchorElement).href,
          text: (anchor.textContent ?? '').trim(),
        }));

        return {
          hrefs: links.map((link) => link.href),
          bodyText: document.body.innerText.replace(/\s+/g, ' ').slice(0, 10_000),
          internalLinks: links
            .filter((link) => /about|team|company|leadership|founder|story/i.test(`${link.text} ${link.href}`))
            .map((link) => link.href),
        };
      });

      hrefs.push(...pageData.hrefs.map(normalizeUrl));
      textSamples.push(pageData.bodyText);

      for (const internalLink of pageData.internalLinks) {
        const normalizedInternalLink = normalizeUrl(internalLink);
        if (
          !visited.has(normalizedInternalLink) &&
          !pagesToVisit.includes(normalizedInternalLink) &&
          sameRegistrableDomain(normalizedInternalLink, website)
        ) {
          pagesToVisit.push(normalizedInternalLink);
        }
      }
    } catch {
      // Ignore individual page failures and keep best-effort data.
    } finally {
      await page.close();
    }
  }

  return {
    founderName: extractFounderNameFromTexts(textSamples, startupName),
    linkedin: extractLinkedIn(hrefs),
    twitter: extractTwitter(hrefs),
  };
}

// ─── Scraper ──────────────────────────────────────────────────────────────────

/**
 * Scrapes public founder / company data for a given startup name.
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

    const query = encodeURIComponent(`${startupName} founder CEO LinkedIn Twitter official site`);
    const url = `https://html.duckduckgo.com/html/?q=${query}`;

    console.log(`[Scraper] Searching for: ${startupName}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });

    const results = await page.evaluate(() => {
      const blocks = Array.from(document.querySelectorAll('.result'));

      return blocks.slice(0, 10).map((block) => {
        const title = block.querySelector('.result__title')?.textContent?.trim() ?? '';
        const url = (block.querySelector('.result__url, .result__a')?.textContent ?? '').trim();
        const href = (block.querySelector('.result__a') as HTMLAnchorElement | null)?.href ?? '';
        const snippet = block.querySelector('.result__snippet')?.textContent?.trim() ?? '';

        return {
          title,
          url: href || url,
          snippet,
        };
      }).filter((result) => result.title || result.url || result.snippet);
    });

    const hrefs = results.map((result) => normalizeUrl(result.url)).filter(Boolean);
    const founderName = extractFounderName(results, startupName);

    const result: ScrapedFounderData = {
      company: startupName,
      founderName,
      website: extractWebsite(hrefs, startupName),
      linkedin: extractLinkedIn(hrefs),
      twitter: extractTwitter(hrefs),
    };

    if (result.website && (!result.founderName || !result.linkedin || !result.twitter)) {
      const websiteSignals = await extractWebsiteSignals(browser, result.website, startupName);
      result.founderName ||= websiteSignals.founderName;
      result.linkedin ||= websiteSignals.linkedin;
      result.twitter ||= websiteSignals.twitter;
    }

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
