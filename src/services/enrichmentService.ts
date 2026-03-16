/**
 * services/enrichmentService.ts - Email Enrichment via Hunter.io
 *
 * Queries the Hunter.io Email Finder API to locate professional email
 * addresses for a given first/last name and company domain.
 *
 * Requires the HUNTER_API_KEY environment variable to be set.
 */

import axios from 'axios';

const HUNTER_BASE_URL = 'https://api.hunter.io/v2';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HunterEmailFinderResponse {
  data: {
    email: string | null;
    score: number;
  };
}

function isLikelyPersonName(name: string): boolean {
  const normalized = name.replace(/\s+/g, ' ').trim();
  const parts = normalized.split(' ');

  if (parts.length < 2 || parts.length > 4) {
    return false;
  }

  return parts.every((part) => /^[A-Z][a-z'’-]+$/.test(part));
}

// ─── Enrichment ───────────────────────────────────────────────────────────────

/**
 * Uses the Hunter.io Email Finder endpoint to locate a professional email.
 *
 * @param name   - Full name of the person (e.g. "John Smith")
 * @param domain - Company domain without protocol (e.g. "acme.com")
 * @returns      Email address string, or null if not found / on error
 */
export async function findEmail(name: string, domain: string): Promise<string | null> {
  const apiKey = process.env.HUNTER_API_KEY;

  if (!apiKey) {
    console.warn('[Enrichment] HUNTER_API_KEY is not set – skipping email lookup');
    return null;
  }

  if (!name || !domain) {
    return null;
  }

  if (!isLikelyPersonName(name)) {
    console.warn(`[Enrichment] Skipping Hunter lookup for invalid founder name: ${name}`);
    return null;
  }

  // Split the full name into first and last parts
  const parts = name.trim().split(/\s+/);
  const firstName = parts[0] ?? '';
  const lastName = parts.slice(1).join(' ') || parts[0]; // fallback if single token

  try {
    const response = await axios.get<HunterEmailFinderResponse>(
      `${HUNTER_BASE_URL}/email-finder`,
      {
        params: {
          domain,
          first_name: firstName,
          last_name: lastName,
          api_key: apiKey,
        },
        timeout: 15_000,
      },
    );

    const email = response.data?.data?.email ?? null;
    console.log(`[Enrichment] Email for ${name} @ ${domain}: ${email ?? 'not found'}`);
    return email;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Enrichment] Hunter.io request failed for ${name} @ ${domain}: ${message}`);
    return null;
  }
}
