-- ==============================================================================
-- FINPAY DATABASE SCHEMA (PostgreSQL 16)
-- Modelagem relacional completa do ecossistema financeiro FinPay
-- Compatível com DBeaver, migrations e consultas analíticas
-- ==============================================================================

-- Habilita extensão para geração de UUIDs nativos
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. TABELA DE USUÁRIOS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(120) NOT NULL,
    email VARCHAR(255) UNIQUE,
    monthly_income_goal NUMERIC(15, 2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 2. TABELA DE INSTITUIÇÕES E CONTAS BANCÁRIAS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    account_type VARCHAR(30) NOT NULL CHECK (account_type IN ('checking', 'savings', 'wallet', 'credit', 'investment')),
    initial_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    current_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    color VARCHAR(20) DEFAULT '#0F3D3E',
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 3. TABELA DE CATEGORIAS DE DESPESA / RECEITA
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('income', 'expense')),
    icon VARCHAR(50) NOT NULL DEFAULT 'Tag',
    color VARCHAR(20) NOT NULL DEFAULT '#10B981',
    is_custom BOOLEAN DEFAULT FALSE
);

-- ------------------------------------------------------------------------------
-- 4. TABELA DE METAS ESTRATÉGICAS / RESERVAS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS financial_goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(120) NOT NULL,
    subtitle VARCHAR(200),
    target_amount NUMERIC(15, 2) NOT NULL,
    current_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    monthly_contribution NUMERIC(15, 2) DEFAULT 0.00,
    target_date VARCHAR(7), -- YYYY-MM
    benchmark VARCHAR(30) DEFAULT '100_CDI' CHECK (benchmark IN ('100_CDI', '110_CDI', 'TESOURO_SELIC', 'IPCA_PLUS_6', 'POUPANCA')),
    priority VARCHAR(20) DEFAULT 'Média' CHECK (priority IN ('Alta', 'Média', 'Essencial')),
    recommended_asset VARCHAR(100) DEFAULT 'Tesouro Selic',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 5. TABELA DE DÍVIDAS E CONTRATOS DE FINANCIAMENTO (Price vs SAC)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS debt_contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
    name VARCHAR(120) NOT NULL,
    creditor VARCHAR(100),
    kind VARCHAR(30) NOT NULL CHECK (kind IN ('loan', 'financing', 'credit_card', 'overdraft', 'consigned', 'other')),
    amortization_system VARCHAR(10) NOT NULL CHECK (amortization_system IN ('price', 'sac', 'fixed')),
    original_amount NUMERIC(15, 2) NOT NULL,
    current_balance NUMERIC(15, 2) NOT NULL,
    monthly_interest_rate NUMERIC(6, 4) NOT NULL, -- Ex: 1.9500 para 1,95% a.m.
    total_installments INT NOT NULL,
    paid_installments INT NOT NULL DEFAULT 0,
    monthly_payment NUMERIC(15, 2) NOT NULL,
    due_day INT CHECK (due_day BETWEEN 1 AND 31),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 6. TABELA DE TRANSAÇÕES FINANCEIRAS (Extrato Principal)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    to_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL, -- Para transferências entre contas
    category_id VARCHAR(50) REFERENCES categories(id) ON DELETE SET NULL,
    goal_id UUID REFERENCES financial_goals(id) ON DELETE SET NULL,
    debt_id UUID REFERENCES debt_contracts(id) ON DELETE SET NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('income', 'expense', 'transfer', 'investment')),
    description VARCHAR(255) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    date DATE NOT NULL,
    payment_method VARCHAR(20) DEFAULT 'pix' CHECK (payment_method IN ('pix', 'debit', 'credit', 'cash', 'transfer', 'boleto')),
    status VARCHAR(20) NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'pending')),
    tags TEXT[], -- Array de tags no PostgreSQL (ex: ['clt', 'holerite'])
    notes TEXT,
    payroll_ym VARCHAR(7), -- YYYY-MM quando originado do Holerite
    external_id VARCHAR(100), -- FITID bancário para conciliação anti-duplicidade
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 7. TABELA DE CONFIGURAÇÃO DE HOLERITE CLT
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
    employer_name VARCHAR(120) NOT NULL,
    role_name VARCHAR(100),
    gross_salary NUMERIC(15, 2) NOT NULL,
    dependents_count INT DEFAULT 0,
    pay_day_rule VARCHAR(30) DEFAULT 'last_business_day' CHECK (pay_day_rule IN ('last_business_day', 'last_day', 'fifth_business_day')),
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- ÍNDICES DE PERFORMANCE (Buscas ultra-rápidas por data e categoria)
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_debts_user ON debt_contracts(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_user ON financial_goals(user_id);

-- ------------------------------------------------------------------------------
-- DADOS INICIAIS DE DEMONSTRAÇÃO (SEEDS)
-- ------------------------------------------------------------------------------
-- Cria usuário principal
INSERT INTO users (id, name, email, monthly_income_goal)
VALUES ('a0000000-0000-0000-0000-000000000001', 'Henrique Paiva', 'henrique@finpay.app', 10000.00)
ON CONFLICT (id) DO NOTHING;

-- Insere categorias padrão
INSERT INTO categories (id, name, kind, icon, color, is_custom) VALUES
('salario', 'Salário & Remuneração', 'income', 'Briefcase', '#10B981', FALSE),
('servicos', 'Serviços & Freelas', 'income', 'Laptop', '#3B82F6', FALSE),
('rendimentos', 'Rendimentos de Investimento', 'income', 'TrendingUp', '#065F46', FALSE),
('moradia', 'Moradia & Aluguel', 'expense', 'Home', '#6366F1', FALSE),
('alimentacao', 'Alimentação & Restaurante', 'expense', 'Utensils', '#F59E0B', FALSE),
('mercado', 'Supermercado', 'expense', 'ShoppingBag', '#8B5CF6', FALSE),
('transporte', 'Transporte & Combustível', 'expense', 'Car', '#EC4899', FALSE),
('saude', 'Saúde & Farmácia', 'expense', 'HeartPulse', '#EF4444', FALSE),
('lazer', 'Lazer & Entretenimento', 'expense', 'Gamepad2', '#14B8A6', FALSE),
('assinaturas', 'Assinaturas & Serviços', 'expense', 'Film', '#64748B', FALSE),
('outros', 'Outros Gastos', 'expense', 'Tag', '#94A3B8', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Insere contas padrão
INSERT INTO bank_accounts (id, user_id, name, account_type, initial_balance, current_balance, color) VALUES
('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Nubank Conta Corrente', 'checking', 3060.00, 3060.00, '#820AD1'),
('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Reserva BTG Selic', 'investment', 14552.80, 14552.80, '#0F3D3E')
ON CONFLICT (id) DO NOTHING;

-- Insere contratos de dívida modelo
INSERT INTO debt_contracts (id, user_id, account_id, name, creditor, kind, amortization_system, original_amount, current_balance, monthly_interest_rate, total_installments, paid_installments, monthly_payment, due_day) VALUES
('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Financiamento Notebook Pro', 'Nubank', 'financing', 'price', 4200.00, 4200.00, 1.95, 12, 0, 396.48, 10),
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Crédito Consignado', 'Itaú', 'consigned', 'sac', 8500.00, 8500.00, 1.35, 24, 0, 468.92, 15)
ON CONFLICT (id) DO NOTHING;

-- Insere meta modelo
INSERT INTO financial_goals (id, user_id, title, subtitle, target_amount, current_amount, monthly_contribution, target_date, benchmark, priority, recommended_asset) VALUES
('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Reserva de Emergência (6 meses)', 'Liquidez diária a 100% do CDI', 20000.00, 14552.80, 500.00, '2026-12', '100_CDI', 'Essencial', 'Tesouro Selic')
ON CONFLICT (id) DO NOTHING;

-- Insere configuração de Holerite CLT
INSERT INTO payroll_configs (user_id, account_id, employer_name, role_name, gross_salary, dependents_count, pay_day_rule, is_enabled) VALUES
('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'NovaEra Tecnologia S.A.', 'Engenheiro de Software', 5800.00, 0, 'last_business_day', TRUE)
ON CONFLICT (user_id) DO NOTHING;

-- Insere algumas transações iniciais
INSERT INTO transactions (user_id, account_id, category_id, type, description, amount, date, payment_method, status, tags) VALUES
('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'alimentacao', 'expense', 'Almoço Restaurante', 42.50, CURRENT_DATE, 'pix', 'paid', ARRAY['alimentacao']),
('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'mercado', 'expense', 'Supermercado da Semana', 215.80, CURRENT_DATE - 1, 'debit', 'paid', ARRAY['mercado', 'semanal']),
('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'servicos', 'income', 'Freela Desenvolvimento Web', 750.00, CURRENT_DATE - 2, 'pix', 'paid', ARRAY['freela'])
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------------------------
-- VIEW ANALÍTICA: SALDO CONSOLIDADO E RESUMO FINANCEIRO
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW view_user_financial_overview AS
SELECT 
    u.id AS user_id,
    u.name AS user_name,
    COALESCE(SUM(b.current_balance), 0.00) AS total_bank_balance,
    COALESCE(SUM(d.current_balance), 0.00) AS total_debts_balance,
    COALESCE(SUM(g.current_amount), 0.00) AS total_invested_goals
FROM users u
LEFT JOIN bank_accounts b ON b.user_id = u.id AND b.is_archived = FALSE
LEFT JOIN debt_contracts d ON d.user_id = u.id
LEFT JOIN financial_goals g ON g.user_id = u.id
GROUP BY u.id, u.name;
