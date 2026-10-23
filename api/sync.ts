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
      // Fallback para usuário demo se não estiver logado
      const userRes = await client.query('SELECT id FROM users LIMIT 1');
      userId = userRes.rows[0]?.id;
    }

    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado.' });
    }

    await client.query('BEGIN');

    // 2. Sincroniza Contas Bancárias (isoladas pelo user_id)
    if (Array.isArray(payload.accounts)) {
      for (const acc of payload.accounts) {
        await client.query(
          `INSERT INTO bank_accounts (user_id, name, account_type, initial_balance, current_balance)
           VALUES ($1, $2, $3, $4, $4)
           ON CONFLICT DO NOTHING`,
          [userId, acc.name, 'checking', Number(acc.balance || 0)]
        );
      }
    }

    // Busca a conta padrão do usuário para associar transações
    const defaultAcc = await client.query(
      'SELECT id FROM bank_accounts WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    const accountId = defaultAcc.rows[0]?.id;

    // 3. Sincroniza Transações (estritamente atreladas ao user_id)
    let importedTxs = 0;
    for (const tx of payload.transactions) {
      const type = tx.isIncome ? 'income' : 'expense';
      const desc = tx.title || tx.description || 'Lançamento';
      const amt = Math.abs(Number(tx.amount || 0));
      const date = tx.date || new Date().toISOString().slice(0, 10);
      const cat = tx.category || 'outros';

      await client.query(
        `INSERT INTO transactions (user_id, account_id, category_id, type, description, amount, date, payment_method, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [userId, accountId, cat, type, desc, amt, date, 'pix', 'paid']
      );
      importedTxs++;
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Sincronização com PostgreSQL concluída!',
      userId,
      importedTransactions: importedTxs,
      syncedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    return res.status(500).json({
      success: false,
      message: 'Erro durante a sincronização.',
      detail: err?.message,
    });
  } finally {
    client.release();
  }
}
