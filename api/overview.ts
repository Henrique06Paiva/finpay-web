import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';

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

const JWT_SECRET = process.env.JWT_SECRET || 'finpay_jwt_secret_token_key_2026_super_secure_vault';

function getUserIdFromRequest(req: VercelRequest): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    return decoded.userId;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Identifica o usuário logado via JWT. Se não houver token, usa usuário demo
  let userId = getUserIdFromRequest(req);

  const client = await pool.connect();
  try {
    if (!userId) {
      const demoUser = await client.query('SELECT id FROM users LIMIT 1');
      userId = demoUser.rows[0]?.id;
    }

    if (!userId) {
      return res.status(200).json({
        success: true,
        summary: { totalBankBalance: 0, totalDebtsBalance: 0, totalInvestedGoals: 0 },
        accounts: [],
        debts: [],
        goals: [],
        recentTransactions: [],
      });
    }

    // 1. Resumo financeiro filtrado estritamente pelo user_id
    const overviewRes = await client.query(
      `SELECT 
          COALESCE(SUM(b.current_balance), 0.00) AS total_bank_balance,
          COALESCE((SELECT SUM(current_balance) FROM debt_contracts WHERE user_id = $1), 0.00) AS total_debts_balance,
          COALESCE((SELECT SUM(current_amount) FROM financial_goals WHERE user_id = $1), 0.00) AS total_invested_goals
       FROM bank_accounts b
       WHERE b.user_id = $1 AND b.is_archived = FALSE`,
      [userId]
    );
    const overview = overviewRes.rows[0] || {};

    // 2. Contas bancárias do usuário
    const accountsRes = await client.query(
      'SELECT id, name, account_type, initial_balance, current_balance, color FROM bank_accounts WHERE user_id = $1 AND is_archived = FALSE',
      [userId]
    );

    // 3. Dívidas do usuário
    const debtsRes = await client.query(
      'SELECT id, name, creditor, kind, amortization_system, current_balance, monthly_interest_rate, total_installments, monthly_payment FROM debt_contracts WHERE user_id = $1',
      [userId]
    );

    // 4. Metas do usuário
    const goalsRes = await client.query(
      'SELECT id, title, subtitle, target_amount, current_amount, benchmark, recommended_asset FROM financial_goals WHERE user_id = $1',
      [userId]
    );

    // 5. Últimas 20 transações do usuário
    const txsRes = await client.query(
      `SELECT t.id, t.type, t.description, t.amount, to_char(t.date, 'YYYY-MM-DD') as date, 
              t.category_id, t.payment_method, t.status, t.tags
       FROM transactions t
       WHERE t.user_id = $1
       ORDER BY t.date DESC, t.created_at DESC
       LIMIT 20`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      userId,
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
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao consultar dados no PostgreSQL.',
      detail: err?.message,
    });
  } finally {
    client.release();
  }
}
