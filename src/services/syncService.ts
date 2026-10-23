import {
  Account,
  Bill,
  Budget,
  Category,
  Debt,
  FinanceState,
  StrategicGoal,
  Transaction,
  TxType,
} from '../types/finance';
import { parseMoney } from '../utils/format';
import { todayISO } from '../utils/date';

/**
 * Payload estruturado compacto para transferência segura e offline
 * via QR Code entre iPhone (PWA) e Android (PAX A910 / Smartphones).
 */
export interface CrossPlatformSyncPayload {
  protocol: 'finpay_sync_v1';
  exportedAt: string;
  sourceDevice: 'iOS_PWA' | 'Android_NDK';
  summary: {
    accountsCount: number;
    transactionsCount: number;
    debtsCount: number;
    goalsCount: number;
  };
  accounts: Array<{
    id: string;
    name: string;
    subtitle?: string;
    balance: number;
  }>;
  transactions: Array<{
    id: string;
    title: string;
    category: string;
    date: string;
    amount: number;
    isIncome: boolean;
    isFixed?: boolean;
  }>;
  debts: Array<{
    id: string;
    title: string;
    institution: string;
    balance: number;
    monthlyRatePercent: number;
    remainingMonths: number;
    isSAC: boolean;
  }>;
  goals: Array<{
    id: string;
    title: string;
    subtitle: string;
    targetAmount: number;
    currentAmount: number;
    remainingMonths: number;
  }>;
  payroll?: {
    employerName: string;
    roleName: string;
    grossSalary: number;
    dependents: number;
    fixedOtherDiscounts: number;
    monthExtraAdjustment: number;
    payOnLastBusinessDay: boolean;
  };
}

/**
 * Converte o estado completo do FinPay (iOS / Web) para o formato interoperável do Android
 */
export function buildSyncPayload(state: FinanceState): CrossPlatformSyncPayload {
  // Mapeia contas
  const accounts = state.accounts.map((a) => ({
    id: a.id,
    name: a.name,
    subtitle: a.type === 'checking' ? 'Conta Corrente' : a.type === 'investment' ? 'Investimentos' : 'Carteira',
    balance: a.initialBalance,
  }));

  // Mapeia até as 30 transações mais recentes para caber com folga no limite de densidade de QR Code
  const sortedTxs = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date));
  const recentTxs = sortedTxs.slice(0, 30).map((t) => ({
    id: t.id,
    title: t.description,
    category: t.categoryId || 'outros',
    date: t.date,
    amount: t.amount,
    isIncome: t.type === 'income',
    isFixed: Boolean(t.billId),
  }));

  // Mapeia dívidas
  const debts = state.debts.map((d) => ({
    id: d.id,
    title: d.name,
    institution: d.creditor || 'Financiamento',
    balance: d.currentBalance,
    monthlyRatePercent: d.monthlyInterestRate,
    remainingMonths: Math.max(1, d.totalInstallments - d.paidInstallments),
    isSAC: d.amortizationSystem === 'sac',
  }));

  // Mapeia metas
  const goals = state.goals.map((g) => ({
    id: g.id,
    title: g.title,
    subtitle: g.subtitle || g.recommendedAsset || 'Meta Financeira',
    targetAmount: g.targetAmount,
    currentAmount: g.currentAmount,
    remainingMonths: 12,
  }));

  const payroll = state.payroll
    ? {
        employerName: state.payroll.employerName || 'Empresa',
        roleName: state.payroll.role || 'Colaborador',
        grossSalary: state.payroll.grossSalary,
        dependents: 0,
        fixedOtherDiscounts: state.payroll.deductions.reduce((acc, d) => acc + d.amount, 0),
        monthExtraAdjustment: 0,
        payOnLastBusinessDay: state.payroll.payDayRule === 'last_business_day',
      }
    : undefined;

  return {
    protocol: 'finpay_sync_v1',
    exportedAt: new Date().toISOString(),
    sourceDevice: 'iOS_PWA',
    summary: {
      accountsCount: accounts.length,
      transactionsCount: recentTxs.length,
      debtsCount: debts.length,
      goalsCount: goals.length,
    },
    accounts,
    transactions: recentTxs,
    debts,
    goals,
    payroll,
  };
}

/**
 * Mescla dados recebidos do Android ou outro iPhone no estado atual sem apagar cadastros prévios
 */
export function mergeSyncPayload(
  currentState: FinanceState,
  payload: CrossPlatformSyncPayload
): FinanceState {
  if (payload.protocol !== 'finpay_sync_v1') {
    throw new Error('Protocolo de sincronização inválido ou incompatível.');
  }

  // 1. Contas
  const mergedAccounts = [...currentState.accounts];
  for (const acc of payload.accounts) {
    const existing = mergedAccounts.find((a) => a.id === acc.id || a.name.toLowerCase() === acc.name.toLowerCase());
    if (existing) {
      existing.initialBalance = acc.balance;
    } else {
      mergedAccounts.push({
        id: acc.id || `acc-${Date.now()}`,
        name: acc.name,
        type: 'checking',
        initialBalance: acc.balance,
        color: '#0F3D3E',
      });
    }
  }

  // 2. Dívidas
  const mergedDebts = [...currentState.debts];
  for (const d of payload.debts) {
    const existing = mergedDebts.find((x) => x.id === d.id || x.name.toLowerCase() === d.title.toLowerCase());
    if (existing) {
      existing.currentBalance = d.balance;
      existing.monthlyInterestRate = d.monthlyRatePercent;
      existing.amortizationSystem = d.isSAC ? 'sac' : 'price';
    } else {
      mergedDebts.push({
        id: d.id || `debt-${Date.now()}`,
        name: d.title,
        creditor: d.institution,
        kind: 'financing',
        amortizationSystem: d.isSAC ? 'sac' : 'price',
        originalAmount: d.balance,
        currentBalance: d.balance,
        monthlyInterestRate: d.monthlyRatePercent,
        totalInstallments: d.remainingMonths,
        paidInstallments: 0,
        monthlyPayment: 0,
        dueDay: 10,
        accountId: mergedAccounts[0]?.id || 'principal',
        createdAt: Date.now(),
      });
    }
  }

  // 3. Metas
  const mergedGoals = [...currentState.goals];
  for (const g of payload.goals) {
    const existing = mergedGoals.find((x) => x.id === g.id || x.title.toLowerCase() === g.title.toLowerCase());
    if (existing) {
      existing.currentAmount = g.currentAmount;
      existing.targetAmount = g.targetAmount;
    } else {
      mergedGoals.push({
        id: g.id || `goal-${Date.now()}`,
        title: g.title,
        subtitle: g.subtitle,
        icon: 'Target',
        color: '#0F3D3E',
        targetAmount: g.targetAmount,
        currentAmount: g.currentAmount,
        monthlyContribution: 200,
        targetDate: todayISO().slice(0, 7),
        benchmark: '100_CDI',
        priority: 'Média',
        recommendedAsset: 'Tesouro Selic',
        createdAt: Date.now(),
      });
    }
  }

  // 4. Transações (evita duplicar por ID)
  const existingTxIds = new Set(currentState.transactions.map((t) => t.id));
  const newTxs: Transaction[] = [];
  for (const t of payload.transactions) {
    if (!existingTxIds.has(t.id)) {
      newTxs.push({
        id: t.id,
        type: t.isIncome ? 'income' : 'expense',
        description: t.title,
        amount: t.amount,
        date: t.date,
        categoryId: t.category,
        accountId: mergedAccounts[0]?.id || 'principal',
        paymentMethod: 'pix',
        status: 'paid',
        tags: ['sincronizado'],
        createdAt: Date.now(),
      });
    }
  }

  return {
    ...currentState,
    accounts: mergedAccounts,
    debts: mergedDebts,
    goals: mergedGoals,
    transactions: [...newTxs, ...currentState.transactions],
  };
}

/**
 * Interface dos parâmetros aceitos via URL (Siri Shortcuts, Webhooks ou Widget iOS)
 */
export interface SiriShortcutLaunchParams {
  action: 'add_tx' | 'view_tab' | 'quick_payroll';
  type?: TxType;
  amount?: number;
  description?: string;
  category?: string;
  tab?: string;
  source?: 'siri' | 'shortcut' | 'webhook';
}

/**
 * Extrai e valida parâmetros de Atalhos da Siri ou Webhook a partir da URL atual
 * Exemplo:
 * https://finpay.app/?add=expense&val=45.90&desc=Almoco&cat=alimentacao
 */
export function parseSiriShortcutUrl(search: string): SiriShortcutLaunchParams | null {
  if (!search || search.length <= 1) return null;

  const params = new URLSearchParams(search);

  // 1. Adicionar transação rápida (ex: Siri "Gastei 50 no almoço")
  const addParam = params.get('add') || params.get('tipo');
  if (addParam) {
    const rawType = addParam.toLowerCase();
    const type: TxType =
      rawType === 'income' || rawType === 'receita' || rawType === 'salario'
        ? 'income'
        : rawType === 'transfer' || rawType === 'transf'
        ? 'transfer'
        : rawType === 'invest' || rawType === 'investimento'
        ? 'investment'
        : 'expense';

    const rawVal = params.get('val') || params.get('valor') || params.get('amount') || '';
    const amount = parseMoney(rawVal);
    const description = params.get('desc') || params.get('descricao') || params.get('title') || '';
    const category = params.get('cat') || params.get('categoria') || undefined;

    return {
      action: 'add_tx',
      type,
      amount: amount > 0 ? amount : undefined,
      description: description ? decodeURIComponent(description) : undefined,
      category: category ? decodeURIComponent(category) : undefined,
      source: (params.get('src') as any) || 'siri',
    };
  }

  // 2. Navegação direta para aba via Atalho (ex: Siri "Ver minhas dívidas")
  const tabParam = params.get('tab') || params.get('aba');
  if (tabParam) {
    return {
      action: 'view_tab',
      tab: tabParam.toLowerCase(),
      source: 'shortcut',
    };
  }

  return null;
}
