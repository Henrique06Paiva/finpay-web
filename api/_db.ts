import { Pool } from 'pg';

/**
 * Pool de conexões PostgreSQL para a API Serverless na Vercel e ambiente Local (Docker).
 *
 * Utiliza DATABASE_URL ou POSTGRES_URL configurado nas variáveis de ambiente.
 * Em desenvolvimento local, conecta por padrão no container Docker finpay_postgres.
 */

const connectionString =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  'postgresql://finpay_admin:finpay_secret_password@localhost:5432/finpay_db';

// Determina se deve usar SSL (necessário para Neon/Supabase em nuvem, desativado para Docker local)
const isLocal =
  connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

export const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
