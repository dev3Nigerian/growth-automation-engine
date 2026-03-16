/**
 * models/leadModel.ts - Lead data model and database operations
 *
 * Provides typed CRUD helpers for the `leads` table.
 * All functions use parameterised queries to prevent SQL injection.
 */

import pool from '../config/database';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Lead {
  id?: number;
  name: string;
  company: string;
  email: string;
  linkedin: string;
  twitter: string;
  website: string;
  industry: string;
  source: string;
  created_at?: Date;
}

// ─── Table Initialisation ─────────────────────────────────────────────────────

/**
 * Creates the `leads` table if it does not already exist.
 * Should be called once during application startup.
 */
export async function initLeadsTable(): Promise<void> {
  const sql = `
    CREATE TABLE IF NOT EXISTS leads (
      id         SERIAL PRIMARY KEY,
      name       VARCHAR(255),
      company    VARCHAR(255),
      email      VARCHAR(255),
      linkedin   VARCHAR(255),
      twitter    VARCHAR(255),
      website    VARCHAR(255),
      industry   VARCHAR(255),
      source     VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  await pool.query(sql);
}

// ─── CRUD Helpers ─────────────────────────────────────────────────────────────

/**
 * Inserts a new lead record into the database.
 * @param lead - Lead object (without `id` and `created_at`)
 * @returns The newly created lead row including generated `id` and `created_at`
 */
export async function createLead(lead: Omit<Lead, 'id' | 'created_at'>): Promise<Lead> {
  const { name, company, email, linkedin, twitter, website, industry, source } = lead;
  const result = await pool.query<Lead>(
    `INSERT INTO leads (name, company, email, linkedin, twitter, website, industry, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [name, company, email, linkedin, twitter, website, industry, source],
  );
  return result.rows[0];
}

/**
 * Looks up a lead by its email address.
 * @param email - Email address to search for
 * @returns The matching Lead or null if not found
 */
export async function findLeadByEmail(email: string): Promise<Lead | null> {
  const result = await pool.query<Lead>('SELECT * FROM leads WHERE email = $1', [email]);
  return result.rows[0] ?? null;
}

/**
 * Returns all leads, ordered by creation date (newest first).
 */
export async function listLeads(): Promise<Lead[]> {
  const result = await pool.query<Lead>('SELECT * FROM leads ORDER BY created_at DESC');
  return result.rows;
}
