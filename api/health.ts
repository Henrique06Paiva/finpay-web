import type { VercelRequest, VercelResponse } from '@vercel/node';
import { pool } from './_db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT NOW() as db_time, version() as pg_version');
      const countRes = await client.query('SELECT count(*) as total_txs FROM transactions');

      return res.status(200).json({
        status: 'online',
        service: 'FinPay PostgreSQL API',
        environment: process.env.NODE_ENV || 'production',
        database: {
          connected: true,
          serverTime: result.rows[0].db_time,
          version: result.rows[0].pg_version,
          totalTransactionsRecorded: Number(countRes.rows[0].total_txs || 0),
        },
      });
    } finally {
      client.release();
    }
  } catch (err: any) {
    return res.status(500).json({
      status: 'error',
      message: 'Falha ao conectar com o banco PostgreSQL.',
      detail: err?.message,
    });
  }
}
