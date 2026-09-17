import 'dotenv/config'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { authRouter } from './auth/routes.js'
import { usersRouter } from './users/routes.js'
import { contestsRouter } from './contests/routes.js'
import { blockchainRouter } from './blockchain/routes.js'
import { startLifecycleTicker } from './contests/lifecycle.js'

const app = express()


const DEFAULT_FRONTEND_ORIGIN = 'http://localhost:5176'

/**
 * CORS allowlist. Comma-separated so the deployed frontend and a local dev
 * server can both be accepted at once:
 *   FRONTEND_ORIGIN=https://your-app.vercel.app,http://localhost:5176
 *
 * Trailing slashes are stripped because a browser's Origin header never
 * carries one — "https://your-app.vercel.app/" would never match, and the
 * resulting CORS failure points nowhere useful.
 */
const ALLOWED_ORIGINS = (process.env.FRONTEND_ORIGIN?.trim() || DEFAULT_FRONTEND_ORIGIN)
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean)

app.use(
  cors({
    origin: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : [DEFAULT_FRONTEND_ORIGIN],
    credentials: true,
  })
)
app.use(express.json())
app.use(cookieParser())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/api/auth', authRouter)
app.use('/api/users', usersRouter)
app.use('/api/contests', contestsRouter)
app.use('/api/blockchain', blockchainRouter)

// Express 5 forwards rejected async handlers here automatically.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

const port = Number(process.env.PORT ?? 3001)
app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`)
  startLifecycleTicker()
})

