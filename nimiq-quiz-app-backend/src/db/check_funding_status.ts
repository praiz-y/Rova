import 'dotenv/config'
import { pool } from './pool.js'

async function check() {
  const result = await pool.query('SELECT id, title, funding_status FROM contests')
  console.log('Contests count:', result.rows.length)
  console.log('Rows:', result.rows)
  await pool.end()
}

check().catch(console.error)
