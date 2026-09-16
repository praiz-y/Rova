import { Router } from 'express';
import { requireAdmin } from '../middleware/adminAuth.js';
import { findContestById, getContestLeaderboard, listRegistrationsByContestPaginated, cancelContest } from './repository.js';
import { getPayoutsByContest, processContestPayouts } from './payouts.js';

/**
 * Admin router providing paginated contest list and management actions.
 * All routes are protected by `requireAdmin` middleware which verifies JWT role="admin".
 */
export const adminRouter = Router();

// GET /api/admin/contests – paginated list with optional filters
// Supported query parameters: page, limit, status, title, sponsor, dateFrom, dateTo
adminRouter.get('/contests', requireAdmin, async (req, res) => {
  const page = Math.max(parseInt(req.query.page as string) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const offset = (page - 1) * limit;

  // Extract filter parameters
  const filters = {
    status: req.query.status as string | undefined,
    title: req.query.title as string | undefined,
    sponsor: req.query.sponsor as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
  };

  // Use repository to fetch filtered contests and total count
  const { contests, total } = await (await import('./repository.js')).searchContests(filters, { limit, offset });

  res.json({ contests, total, page, limit });
});

// GET /api/admin/contests/:id/participants – paginated participants list
adminRouter.get('/contests/:id/participants', requireAdmin, async (req, res) => {
  const contestId = req.params.id as string;
  const page = Math.max(parseInt(req.query.page as string) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const search = (req.query.search as string) ?? '';
  const { participants, total } = await listRegistrationsByContestPaginated(contestId, { page, limit, search });
  res.json({ participants, total, page, limit });
});

// Existing detailed view (unchanged)
adminRouter.get('/contests/:id', requireAdmin, async (req, res) => {
  const contestId = req.params.id as string;
  const contest = await findContestById(contestId);
  if (!contest) {
    res.status(404).json({ error: 'Contest not found' });
    return;
  }
  const leaderboard = await getContestLeaderboard(contestId);
  const payouts = await getPayoutsByContest(contestId);
  const participants = await (await import('./repository.js')).listRegistrationsByContest(contestId);
  res.json({ contest, leaderboard, payouts, participants });
});

// POST /api/admin/contests/:id/payouts/:payoutId/retry – manual retry
adminRouter.post('/contests/:id/payouts/:payoutId/retry', requireAdmin, async (req, res) => {
  const id = req.params.id as string;
  try {
    const result = await processContestPayouts(id);
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/admin/contests/:id/invalidate – emergency invalidate/cancel
adminRouter.post('/contests/:id/invalidate', requireAdmin, async (req, res) => {
  const id = req.params.id as string;
  try {
    const invalidated = await cancelContest(id, null);
    res.json({ ok: true, contest: invalidated });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/admin/analytics/contest-stats – returns basic analytics data for the admin dashboard
adminRouter.get('/analytics/contest-stats', requireAdmin, async (_req, res) => {
  try {
    const stats = await (await import('./analyticsService.js')).getContestAnalytics();
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/admin/contests/:id/analytics – returns contest-specific analytics
adminRouter.get('/contests/:id/analytics', requireAdmin, async (req, res) => {
  try {
    const contestId = req.params.id as string;
    const analytics = await (await import('./analyticsService.js')).getContestAnalyticsById(contestId);
    res.json(analytics);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});


// GET /api/contests/:id/leaderboard/stream – Server‑Sent Events for live leaderboard updates
adminRouter.get('/contests/:id/leaderboard/stream', async (req, res) => {
  const contestId = req.params.id as string;
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();

  const sendUpdate = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Subscribe to leaderboard changes via a simple in‑process EventEmitter (see src/contests/sse.ts)
  const { subscribe, unsubscribe } = await import('./sse.js');
  const handler = (payload: any) => {
    if (payload.contestId === contestId) {
      sendUpdate(payload);
    }
  };
  subscribe(handler);

  // Keep connection alive – send comment every 30s
  const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe(handler);
    res.end();
  });
});
