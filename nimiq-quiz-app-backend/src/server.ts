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


app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5176',
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

