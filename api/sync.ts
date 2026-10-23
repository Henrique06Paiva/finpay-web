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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const payload = req.body;
  if (!payload || !Array.isArray(payload.transactions)) {
    return res.status(400).json({ error: 'Payload de sincronização inválido.' });
  }

  const client = await pool.connect();
  try {
    // 1. Obtém o ID do usuário pelo Token JWT autenticado
    let userId = getUserIdFromRequest(req);

    if (!userId) {
      // Fallback para primeiro usuário existente ou cria usuário padrão
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

    await client.query('BEGIN');

    // 2. Sincroniza Contas Bancárias (isoladas pelo user_id)
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

    // Busca ou garante a existência de uma conta padrão do usuário para associar transações
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

    // 3. Obtém conjunto de categorias válidas existentes no banco
    const validCatsRes = await client.query('SELECT id FROM categories');
    const validCategorySet = new Set(validCatsRes.rows.map((r: any) => r.id));

    // 4. Sincroniza Transações (estritamente atreladas ao user_id)
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
          'SELECT id FROM transactions WHERE user_id = $1 AND external_id = $2 LIMIT 1',
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

    return res.status(200).json({
      success: true,
      message: 'Sincronização com PostgreSQL concluída com sucesso!',
      userId,
      importedTransactions: importedTxs,
      syncedAt: new Date().toISOString(),
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
