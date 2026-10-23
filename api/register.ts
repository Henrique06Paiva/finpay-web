import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const { name, email, password } = req.body || {};

  if (!email || !password || password.length < 6) {
    return res.status(400).json({
      error: 'E-mail e senha (mínimo 6 caracteres) são obrigatórios.',
    });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const userName = name ? String(name).trim() : normalizedEmail.split('@')[0];

  const client = await pool.connect();
  try {
    // 1. Verifica se já existe um usuário com esse e-mail
    const existing = await client.query('SELECT id FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Já existe uma conta com este e-mail. Faça login.' });
    }

    // 2. Criptografa a senha com salt de 10 rounds
    const passwordHash = await bcrypt.hash(password, 10);

    // 3. Cria o usuário com seu UUID único
    const userInsert = await client.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at`,
      [userName, normalizedEmail, passwordHash]
    );

    const user = userInsert.rows[0];

    // 4. Cria automaticamente 2 contas bancárias padrão para o novo usuário
    await client.query(
      `INSERT INTO bank_accounts (user_id, name, account_type, initial_balance, current_balance, color)
       VALUES 
       ($1, 'Conta Principal', 'checking', 0.00, 0.00, '#0F3D3E'),
       ($1, 'Reserva de Emergência', 'investment', 0.00, 0.00, '#10B981')`,
      [user.id]
    );

    // 5. Gera o JWT seguro com validade de 30 dias
    const token = jwt.sign(
      { userId: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.status(201).json({
      success: true,
      message: 'Conta criada com sucesso no PostgreSQL!',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      error: 'Erro interno ao registrar usuário no PostgreSQL.',
      detail: err?.message,
    });
  } finally {
    client.release();
  }
}
