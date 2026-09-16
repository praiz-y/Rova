/**
 * Applies schema.sql. Deliberately not a full migration framework (Rule 25:
 * avoid overengineering) — schema.sql is written to be idempotent
 * (CREATE ... IF NOT EXISTS) so re-running it is always safe. Revisit with a
 * real migration tool once the schema needs to evolve with production data.
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pool } from './pool.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function migrate() {
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf-8')
  await pool.query(sql)
  console.log('Schema applied.')
  await pool.end()
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
