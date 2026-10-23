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
      // 1. Resumo financeiro consolidado da view analítica
      const overviewRes = await client.query('SELECT * FROM view_user_financial_overview LIMIT 1');
      const overview = overviewRes.rows[0] || {};

      // 2. Contas bancárias
      const accountsRes = await client.query(
        'SELECT id, name, account_type, initial_balance, current_balance, color FROM bank_accounts WHERE is_archived = FALSE'
      );

      // 3. Dívidas ativas
      const debtsRes = await client.query(
        'SELECT id, name, creditor, kind, amortization_system, current_balance, monthly_interest_rate, total_installments, monthly_payment FROM debt_contracts'
      );

      // 4. Metas financeiras
      const goalsRes = await client.query(
        'SELECT id, title, subtitle, target_amount, current_amount, benchmark, recommended_asset FROM financial_goals'
      );

      // 5. Últimas 20 transações
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
