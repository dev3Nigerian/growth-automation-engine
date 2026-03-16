/**
 * routes/leadRoutes.ts - Lead API Routes
 *
 * Mounts the lead-related HTTP endpoints on the Express router.
 */

import { Router } from 'express';
import { discoverLeads } from '../controllers/leadController';

const router = Router();

/**
 * POST /api/discover
 * Body: { topic: string }
 * Starts the lead discovery pipeline for the given topic.
 */
router.post('/discover', discoverLeads);

export default router;
