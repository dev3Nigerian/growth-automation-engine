-- database/init.sql
-- Run this script once to set up the Growth Automation Engine schema.
--
-- Usage:
--   psql -U <user> -d <database> -f database/init.sql

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
);

-- Index for fast email lookups (idempotency checks)
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_email ON leads(email) WHERE email IS NOT NULL AND email <> '';
