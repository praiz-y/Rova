import { Router } from 'express'
import { broadcastRawTransaction, checkRawTransaction } from './nimiqRpc.js'

export const blockchainRouter = Router()

/**
 * Desktop wallet fallback (D050): the Nimiq Hub API only signs transactions
 * client-side, it does not reliably relay them to the network the way the
 * Mini App SDK's `sendBasicTransactionWithData` does inside Nimiq Pay. This
 * reuses the same broadcast path D048 built for server-signed payouts —
 * no wallet/keystore access needed, just relaying already-signed bytes.
 */
blockchainRouter.post('/broadcast', async (req, res) => {
  const hex = typeof req.body?.hex === 'string' ? req.body.hex : null
  if (!hex) {
    res.status(400).json({ error: 'hex is required' })
    return
  }
  try {
    await checkRawTransaction(hex)
    const hash = await broadcastRawTransaction(hex)
    res.json({ hash })
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? 'Failed to broadcast transaction' })
  }
})
