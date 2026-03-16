/**
 * app.ts - Main Express application entry point
 *
 * Initialises the Express server, registers middleware, and mounts routes.
 * Loads environment variables via dotenv before anything else runs.
 */

import dotenv from 'dotenv';
dotenv.config();

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import leadRoutes from './routes/leadRoutes';
import { initLeadsTable } from './models/leadModel';

const app: Application = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Health Check ─────────────────────────────────────────────────────────────
/**
 * GET /health
 * Simple liveness probe used by load balancers and monitoring tools.
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', leadRoutes);

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Global Error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Server Bootstrap ─────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? '3000', 10);

async function bootstrap(): Promise<void> {
  await initLeadsTable();
  app.listen(PORT, () => {
    console.log(`Growth Automation Engine running on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('[Startup] Failed to initialise application:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});

export default app;
