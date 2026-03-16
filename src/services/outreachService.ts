/**
 * services/outreachService.ts - Personalised Outreach Email Generator
 *
 * Generates a ready-to-send cold outreach email based on a lead's profile.
 * Uses a simple template that can be swapped for an LLM-based approach later.
 */

import { Lead } from '../models/leadModel';

export interface OutreachEmail {
  subject: string;
  body: string;
}

/**
 * Produces a personalised outreach email for the given lead.
 *
 * @param lead - Lead object containing at minimum `name`, `company`, and `industry`
 * @returns    An object with `subject` and `body` strings
 */
export function generateEmail(lead: Partial<Lead>): OutreachEmail {
  const name = lead.name ?? 'there';
  const company = lead.company ?? 'your company';
  const industry = lead.industry ?? 'your industry';

  const subject = `Quick note about ${company}`;

  const body = `Hi ${name},

I came across ${company} while researching companies in ${industry}.

Would love to connect and learn more about what you're building.

Best,
Faithful`;

  return { subject, body };
}
