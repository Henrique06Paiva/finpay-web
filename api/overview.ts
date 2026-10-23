import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

const connectionString =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  'postgresql://finpay_admin:finpay_secret_password@localhost:5432/finpay_db';

const isLocal =
  connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 5,
  connectionTimeoutMillis: 5000,
});

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
      const overviewRes = await client.query('SELECT * FROM view_user_financial_overview LIMIT 1');
      const overview = overviewRes.rows[0] || {};

      const accountsRes = await client.query(
        'SELECT id, name, account_type, initial_balance, current_balance, color FROM bank_accounts WHERE is_archived = FALSE'
      );

      const debtsRes = await client.query(
        'SELECT id, name, creditor, kind, amortization_system, current_balance, monthly_interest_rate, total_installments, monthly_payment FROM debt_contracts'
      );

      const goalsRes = await client.query(
        'SELECT id, title, subtitle, target_amount, current_amount, benchmark, recommended_asset FROM financial_goals'
      );

      const txsRes = await client.query(
        `SELECT t.id, t.type, t.description, t.amount, to_char(t.date, 'YYYY-MM-DD') as date, 
                t.category_id, t.payment_method, t.status, t.tags
         FROM transactions t
         ORDER BY t.date DESC, t.created_at DESC
         LIMIT 20`
      );

      return res.status(200).json({
        success: true,
        summary: {
          totalBankBalance: Number(overview.total_bank_balance || 0),
          totalDebtsBalance: Number(overview.total_debts_balance || 0),
          totalInvestedGoals: Number(overview.total_invested_goals || 0),
        },
        accounts: accountsRes.rows,
        debts: debtsRes.rows,
        goals: goalsRes.rows,
        recentTransactions: txsRes.rows,
      });
    } finally {
      client.release();
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao consultar dados no PostgreSQL.',
      detail: err?.message,
    });
  }
}
