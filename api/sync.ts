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

function setCorsHeaders(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin || '';
  const allowed =
    origin.includes('vercel.app') ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1');

  res.setHeader('Access-Control-Allow-Origin', allowed ? origin : '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

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

async function fetchConsolidatedPayload(client: any, userId: string) {
  // 1. Contas
  const accountsRes = await client.query(
    'SELECT id, name, account_type, initial_balance, current_balance FROM bank_accounts WHERE user_id = $1 AND is_archived = FALSE',
    [userId]
  );
  const accounts = accountsRes.rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    subtitle: r.account_type === 'checking' ? 'Conta Corrente' : 'Conta',
    balance: Number(r.current_balance ?? r.initial_balance ?? 0),
  }));

  // 2. Dívidas
  const debtsRes = await client.query(
    'SELECT id, name, creditor, current_balance, monthly_interest_rate, total_installments, paid_installments, amortization_system FROM debt_contracts WHERE user_id = $1',
    [userId]
  );
  const debts = debtsRes.rows.map((d: any) => ({
    id: d.id,
    title: d.name,
    institution: d.creditor || 'Financiamento',
    balance: Number(d.current_balance || 0),
    monthlyRatePercent: Number(d.monthly_interest_rate || 0),
    remainingMonths: Math.max(1, (d.total_installments || 1) - (d.paid_installments || 0)),
    isSAC: d.amortization_system === 'sac',
  }));

  // 3. Metas
  const goalsRes = await client.query(
    'SELECT id, title, subtitle, target_amount, current_amount, benchmark, recommended_asset FROM financial_goals WHERE user_id = $1',
    [userId]
  );
  const goals = goalsRes.rows.map((g: any) => ({
    id: g.id,
    title: g.title,
    subtitle: g.subtitle || g.recommended_asset || 'Meta Financeira',
    targetAmount: Number(g.target_amount || 0),
    currentAmount: Number(g.current_amount || 0),
    remainingMonths: 12,
  }));

  // 4. Transações completas (sem limite artificial de 20 ou 30)
  const txsRes = await client.query(
    `SELECT t.id, t.type, t.description, t.amount, to_char(t.date, 'YYYY-MM-DD') as date, 
            t.category_id, t.status, t.external_id
     FROM transactions t
     WHERE t.user_id = $1
     ORDER BY t.date DESC, t.created_at DESC`,
    [userId]
  );
  const transactions = txsRes.rows.map((t: any) => ({
    id: t.external_id || t.id,
    title: t.description,
    category: t.category_id || 'outros',
    date: t.date,
    amount: Number(t.amount || 0),
    isIncome: t.type === 'income',
  }));

  return {
    protocol: 'finpay_sync_v1' as const,
    exportedAt: new Date().toISOString(),
    sourceDevice: 'iOS_PWA' as const,
    summary: {
      accountsCount: accounts.length,
      transactionsCount: transactions.length,
      debtsCount: debts.length,
      goalsCount: goals.length,
    },
    accounts,
    transactions,
    debts,
    goals,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const client = await pool.connect();
  try {
    // 1. Identifica o usuário pelo Token JWT
    let userId = getUserIdFromRequest(req);

    if (!userId) {
      // Fallback para usuário demo se não autenticado
      const userRes = await client.query('SELECT id FROM users ORDER BY created_at ASC LIMIT 1');
      if (userRes.rows.length > 0) {
        userId = userRes.rows[0].id;
      } else {
        const newUser = await client.query(
          `INSERT INTO users (name, email) VALUES ('Usuário FinPay', 'usuario@finpay.app') RETURNING id`
        );
        userId = newUser.rows[0].id;
      }
    }

    // OPERAÇÃO GET: Download / Pull direto do estado consolidado na nuvem
    if (req.method === 'GET') {
      const payload = await fetchConsolidatedPayload(client, userId);
      return res.status(200).json({
        success: true,
        userId,
        payload,
      });
    }

    // OPERAÇÃO POST: Upload / Push com Upsert completo + retorno do estado consolidado
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método não permitido. Use GET ou POST.' });
    }

    const payload = req.body;
    if (!payload || !Array.isArray(payload.transactions)) {
      return res.status(400).json({ error: 'Payload de sincronização inválido.' });
    }

    await client.query('BEGIN');

    // 2. Sincroniza Contas Bancárias
    if (Array.isArray(payload.accounts) && payload.accounts.length > 0) {
      for (const acc of payload.accounts) {
        if (!acc.name) continue;
        const existing = await client.query(
          'SELECT id FROM bank_accounts WHERE user_id = $1 AND name = $2 LIMIT 1',
          [userId, acc.name]
        );
        if (existing.rows.length === 0) {
          await client.query(
            `INSERT INTO bank_accounts (user_id, name, account_type, initial_balance, current_balance)
             VALUES ($1, $2, 'checking', $3, $3)`,
            [userId, acc.name, Number(acc.balance || 0)]
          );
        }
      }
    }

    // Busca ou garante a existência de uma conta padrão do usuário
    let defaultAcc = await client.query(
      'SELECT id FROM bank_accounts WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    let accountId = defaultAcc.rows[0]?.id;
    if (!accountId) {
      const createdAcc = await client.query(
        `INSERT INTO bank_accounts (user_id, name, account_type, initial_balance, current_balance)
         VALUES ($1, 'Conta Principal', 'checking', 0, 0) RETURNING id`,
        [userId]
      );
      accountId = createdAcc.rows[0]?.id;
    }

    // 3. Sincroniza Metas Financeiras (se enviadas)
    if (Array.isArray(payload.goals) && payload.goals.length > 0) {
      for (const g of payload.goals) {
        if (!g.title) continue;
        const existing = await client.query(
          'SELECT id FROM financial_goals WHERE user_id = $1 AND title = $2 LIMIT 1',
          [userId, g.title]
        );
        if (existing.rows.length === 0) {
          await client.query(
            `INSERT INTO financial_goals (user_id, title, subtitle, target_amount, current_amount)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, g.title, g.subtitle || 'Meta Financeira', Number(g.targetAmount || 0), Number(g.currentAmount || 0)]
          );
        } else {
          await client.query(
            `UPDATE financial_goals
             SET target_amount = $1, current_amount = $2
             WHERE id = $3`,
            [Number(g.targetAmount || 0), Number(g.currentAmount || 0), existing.rows[0].id]
          );
        }
      }
    }

    // 4. Sincroniza Dívidas (se enviadas)
    if (Array.isArray(payload.debts) && payload.debts.length > 0) {
      for (const d of payload.debts) {
        if (!d.title) continue;
        const existing = await client.query(
          'SELECT id FROM debt_contracts WHERE user_id = $1 AND name = $2 LIMIT 1',
          [userId, d.title]
        );
        const sys = d.isSAC ? 'sac' : 'price';
        if (existing.rows.length === 0) {
          await client.query(
            `INSERT INTO debt_contracts (user_id, account_id, name, creditor, kind, amortization_system, original_amount, current_balance, monthly_interest_rate, total_installments, monthly_payment)
             VALUES ($1, $2, $3, $4, 'financing', $5, $6, $6, $7, $8, 0)`,
            [userId, accountId, d.title, d.institution || 'Financiamento', sys, Number(d.balance || 0), Number(d.monthlyRatePercent || 0), Number(d.remainingMonths || 12)]
          );
        } else {
          await client.query(
            `UPDATE debt_contracts
             SET current_balance = $1, monthly_interest_rate = $2, amortization_system = $3
             WHERE id = $4`,
            [Number(d.balance || 0), Number(d.monthlyRatePercent || 0), sys, existing.rows[0].id]
          );
        }
      }
    }

    // 5. Categorias válidas existentes no banco
    const validCatsRes = await client.query('SELECT id FROM categories');
    const validCategorySet = new Set(validCatsRes.rows.map((r: any) => r.id));

    // 6. Sincroniza Transações (estritamente atreladas ao user_id, SEM CORTE DE 30!)
    let importedTxs = 0;
    for (const tx of payload.transactions) {
      const type = tx.isIncome ? 'income' : 'expense';
      const desc = tx.title || tx.description || 'Lançamento';
      const amt = Math.abs(Number(tx.amount || 0));
      const date = tx.date || new Date().toISOString().slice(0, 10);
      const rawCat = tx.category || 'outros';
      const cat = validCategorySet.has(rawCat) ? rawCat : 'outros';
      const extId = tx.id ? String(tx.id) : null;

      if (extId) {
        const existingTx = await client.query(
          'SELECT id FROM transactions WHERE user_id = $1 AND (external_id = $2 OR id::text = $2) LIMIT 1',
          [userId, extId]
        );
        if (existingTx.rows.length > 0) {
          await client.query(
            `UPDATE transactions 
             SET account_id = $1, category_id = $2, type = $3, description = $4, amount = $5, date = $6
             WHERE id = $7`,
            [accountId, cat, type, desc, amt, date, existingTx.rows[0].id]
          );
          importedTxs++;
          continue;
        }
      }

      await client.query(
        `INSERT INTO transactions (user_id, account_id, category_id, type, description, amount, date, payment_method, status, external_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [userId, accountId, cat, type, desc, amt, date, 'pix', 'paid', extId]
      );
      importedTxs++;
    }

    await client.query('COMMIT');

    // Retorna o estado consolidado na nuvem para que o cliente realize o merge bidirecional imediato
    const consolidated = await fetchConsolidatedPayload(client, userId);

    return res.status(200).json({
      success: true,
      message: 'Sincronização com PostgreSQL concluída com sucesso!',
      userId,
      importedTransactions: importedTxs,
      syncedAt: new Date().toISOString(),
      payload: consolidated,
    });
  } catch (err: any) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignora erro no rollback
    }
    return res.status(500).json({
      success: false,
      message: 'Erro durante a sincronização com o PostgreSQL.',
      detail: err?.message || String(err),
    });
  } finally {
    client.release();
  }
}
