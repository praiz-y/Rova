import { Router } from 'express'
import { pool } from '../db/pool.js';
import { getUserHistory, getSponsoredContests } from './userHistory.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/requireAuth.js'

export const usersRouter = Router()

// Not specified by any product decision yet — a reasonable default, easy to
// revisit later: 3-20 chars, letters/digits/underscore, starting with a letter.
const USERNAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/

usersRouter.get('/me', requireAuth, async (req, res) => {
  const { userId } = (req as AuthenticatedRequest).session
  const result = await pool.query<{ id: string; address: string; username: string | null }>(
    'SELECT id, address, username FROM users WHERE id = $1',
    [userId]
  )
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  res.json(result.rows[0])
})

usersRouter.post('/username', requireAuth, async (req, res) => {
  const { userId } = (req as AuthenticatedRequest).session
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : null

  if (!username || !USERNAME_PATTERN.test(username)) {
    res.status(400).json({
      error: 'Username must be 3-20 characters, start with a letter, and contain only letters, digits, or underscore',
    })
    return
  }

  try {
    const result = await pool.query<{ id: string; username: string }>(
      'UPDATE users SET username = $1 WHERE id = $2 RETURNING id, username',
      [username, userId]
    )
    res.json(result.rows[0])
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: 'Username is already taken' })
      return
    }
    throw err
  }
})

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '23505'
}
// Get user history
usersRouter.get('/:id/history', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { userId } = (req as AuthenticatedRequest).session;
  if (userId !== id) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  try {
    const history = await getUserHistory(id);
    res.json(history);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve history' });
  }
});

// Get contests sponsored by user
usersRouter.get('/:id/sponsored', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { userId } = (req as AuthenticatedRequest).session;
  if (userId !== id) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  try {
    const contests = await getSponsoredContests(id);
    res.json(contests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve sponsored contests' });
  }
});
