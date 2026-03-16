/**
 * config/database.ts - PostgreSQL connection pool
 *
 * Exports a single pg.Pool instance shared across the application.
 * Connection parameters are read from the DATABASE_URL environment variable.
 */

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err: Error) => {
  console.error('[Database] Unexpected pool error:', err.message);
});

export default pool;
