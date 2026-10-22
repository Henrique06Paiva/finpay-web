import {
  Account,
  AmortizationSystem,
  Bill,
  Budget,
  Category,
  Debt,
  FinanceState,
  Transaction,
} from '../types/finance';
import {
  createDefaultState,
  DEFAULT_ACCOUNTS,
  DEFAULT_CATEGORIES,
  DEFAULT_PREFS,
  DEFAULT_SECURITY,
} from '../data/defaults';
import { addMonths, daysInMonth, diffDays, endOfMonth, shiftYM, startOfMonth, todayISO, ymOf } from './date';
import { norm, round2 } from './format';

const STORAGE_KEY = 'aura_finance_state_v3';

// Migração segura caso o usuário já tivesse lançamentos salvos na v2
export function loadFinanceState(): FinanceState {
  try {
    const rawV3 = localStorage.getItem(STORAGE_KEY);
    if (rawV3) {
      const parsed = JSON.parse(rawV3) as Partial<FinanceState>;
      return {
        version: 3,
        accounts: parsed.accounts?.length ? parsed.accounts : DEFAULT_ACCOUNTS,
        categories: parsed.categories?.length ? parsed.categories : DEFAULT_CATEGORIES,
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
        budgets: Array.isArray(parsed.budgets) ? parsed.budgets : [],
        bills: Array.isArray(parsed.bills) ? parsed.bills : [],
        debts: Array.isArray(parsed.debts) ? parsed.debts : [],
        goals: Array.isArray(parsed.goals) ? parsed.goals : [],
        security: { ...DEFAULT_SECURITY, ...(parsed.security || {}) },
        prefs: { ...DEFAULT_PREFS, ...(parsed.prefs || {}) },
      };
    }

    // Tenta migrar da v2_clean se existir
    const oldTxRaw = localStorage.getItem('aura_ios_transactions_v2_clean');
    const oldGoalsRaw = localStorage.getItem('aura_ios_goals_v2_clean');
    const oldSecRaw = localStorage.getItem('aura_ios_security_v2_clean');

    const base = createDefaultState();

    if (oldTxRaw) {
      const oldTxs = JSON.parse(oldTxRaw) as Array<any>;
      base.transactions = oldTxs.map((t, idx) => ({
        id: t.id || `tx-${Date.now()}-${idx}`,
        type: t.type === 'investment' ? 'investment' : t.type === 'income' ? 'income' : 'expense',
        description: t.description || 'Lançamento',
        amount: Number(t.amount) || 0,
        date: t.date || todayISO(),
        categoryId: mapLegacyCategoryName(t.category, t.type),
        accountId: 'principal',
        paymentMethod: t.paymentMethod || 'pix',
        status: 'paid',
        tags: [],
        goalId: t.goalId,
        createdAt: Date.now() - idx * 1000,
      }));
    }

    if (oldGoalsRaw) {
      base.goals = JSON.parse(oldGoalsRaw);
    }
    if (oldSecRaw) {
      base.security = { ...DEFAULT_SECURITY, ...JSON.parse(oldSecRaw) };
    }

    return base;
  } catch {
    return createDefaultState();
  }
}

function mapLegacyCategoryName(name: string | undefined, type: string): string {
  if (type === 'income') return 'salario';
  const n = norm(name || '');
  if (n.includes('moradia') || n.includes('aluguel')) return 'moradia';
  if (n.includes('alimenta')) return 'alimentacao';
  if (n.includes('mercado')) return 'mercado';
  if (n.includes('transporte')) return 'transporte';
  if (n.includes('assinatura')) return 'assinaturas';
  if (n.includes('saude')) return 'saude';
  if (n.includes('lazer')) return 'lazer';
  return 'outros';
}

export function saveFinanceState(state: FinanceState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

/**
 * Calcula o saldo atual real de cada conta considerando:
 * - Saldo inicial da conta
 * - Entradas pagas (+)
 * - Despesas e aportes pagos (-)
 * - Transferências enviadas (-) e recebidas (+) sem duplicar receitas/despesas!
 */
export function computeAccountBalances(
  accounts: Account[],
  transactions: Transaction[]
): Record<string, number> {
  const balances: Record<string, number> = {};
  for (const acc of accounts) {
    balances[acc.id] = acc.initialBalance || 0;
  }

  for (const tx of transactions) {
    if (tx.status !== 'paid') continue;
    if (tx.type === 'income') {
      balances[tx.accountId] = round2((balances[tx.accountId] || 0) + tx.amount);
    } else if (tx.type === 'expense' || tx.type === 'investment') {
      balances[tx.accountId] = round2((balances[tx.accountId] || 0) - tx.amount);
    } else if (tx.type === 'transfer') {
      balances[tx.accountId] = round2((balances[tx.accountId] || 0) - tx.amount);
      if (tx.toAccountId) {
        balances[tx.toAccountId] = round2((balances[tx.toAccountId] || 0) + tx.amount);
      }
    }
  }

  return balances;
}

export interface MonthlySummary {
  ym: string;
  paidIncome: number;
  paidExpense: number;
  paidInvestment: number;
  pendingPayables: number; // Despesas pendentes + Contas fixas do mês ainda não pagas
  pendingReceivables: number; // Receitas a receber no mês
  netFlow: number; // Entradas - Saídas no mês
  byCategory: Array<{
    category: Category;
    amount: number;
    pct: number;
    prevMonthAmount: number;
    deltaPct: number | null;
  }>;
}

export function computeMonthlySummary(
  ym: string,
  transactions: Transaction[],
  bills: Bill[],
  categories: Category[]
): MonthlySummary {
  const prevYm = shiftYM(ym, -1);
  let paidIncome = 0;
  let paidExpense = 0;
  let paidInvestment = 0;
  let pendingPayables = 0;
  let pendingReceivables = 0;

  const catTotals: Record<string, number> = {};
  const prevCatTotals: Record<string, number> = {};

  for (const tx of transactions) {
    const txYm = ymOf(tx.date);
    // Transferências entre contas NUNCA entram como receita ou despesa
    if (tx.type === 'transfer') continue;

    if (txYm === ym) {
      if (tx.status === 'paid') {
        if (tx.type === 'income') {
          paidIncome += tx.amount;
        } else if (tx.type === 'investment') {
          paidInvestment += tx.amount;
        } else if (tx.type === 'expense') {
          paidExpense += tx.amount;
          const cid = tx.categoryId || 'outros';
          catTotals[cid] = (catTotals[cid] || 0) + tx.amount;
        }
      } else {
        // Pendente (Contas a pagar / Valores a receber)
        if (tx.type === 'income') pendingReceivables += tx.amount;
        else if (tx.type === 'expense') pendingPayables += tx.amount;
      }
    } else if (txYm === prevYm && tx.status === 'paid' && tx.type === 'expense') {
      const cid = tx.categoryId || 'outros';
      prevCatTotals[cid] = (prevCatTotals[cid] || 0) + tx.amount;
    }
  }

  // Soma também contas fixas ativas cujo próximo vencimento cai neste mês
  for (const bill of bills) {
    if (!bill.active) continue;
    if (ymOf(bill.nextDue) === ym) {
      pendingPayables += bill.amount;
    }
  }

  const catMap = new Map(categories.map((c) => [c.id, c]));
  const fallbackCat: Category = {
    id: 'outros',
    name: 'Outros',
    kind: 'expense',
    icon: 'MoreHorizontal',
    color: '#7A7A7A',
  };

  const byCategory = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([cid, amount]) => {
      const category = catMap.get(cid) || fallbackCat;
      const pct = paidExpense > 0 ? (amount / paidExpense) * 100 : 0;
      const prevMonthAmount = prevCatTotals[cid] || 0;
      const deltaPct =
        prevMonthAmount > 0 ? ((amount - prevMonthAmount) / prevMonthAmount) * 100 : null;
      return {
        category,
        amount: round2(amount),
        pct,
        prevMonthAmount: round2(prevMonthAmount),
        deltaPct,
      };
    });

  return {
    ym,
    paidIncome: round2(paidIncome),
    paidExpense: round2(paidExpense),
    paidInvestment: round2(paidInvestment),
    pendingPayables: round2(pendingPayables),
    pendingReceivables: round2(pendingReceivables),
    netFlow: round2(paidIncome - paidExpense - paidInvestment),
    byCategory,
  };
}

/**
 * Gera a série de evolução do saldo ao longo do tempo (últimos 6 meses ou dias do mês atual)
 */
export function computeBalanceEvolution(
  accounts: Account[],
  transactions: Transaction[],
  currentYm: string
): Array<{ label: string; ym: string; balance: number; income: number; expense: number }> {
  const initialTotal = accounts.reduce((acc, a) => acc + (a.initialBalance || 0), 0);
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    months.push(shiftYM(currentYm, -i));
  }

  return months.map((ym) => {
    const endIso = endOfMonth(ym);
    let balanceUpToEnd = initialTotal;
    let monthIncome = 0;
    let monthExpense = 0;

    for (const tx of transactions) {
      if (tx.status !== 'paid') continue;
      if (tx.date <= endIso) {
        if (tx.type === 'income') balanceUpToEnd += tx.amount;
        else if (tx.type === 'expense' || tx.type === 'investment') balanceUpToEnd -= tx.amount;
      }
      if (ymOf(tx.date) === ym) {
        if (tx.type === 'income') monthIncome += tx.amount;
        else if (tx.type === 'expense') monthExpense += tx.amount;
      }
    }

    const [, m] = ym.split('-').map(Number);
    const shortLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    return {
      label: shortLabels[(m || 1) - 1],
      ym,
      balance: round2(balanceUpToEnd),
      income: round2(monthIncome),
      expense: round2(monthExpense),
    };
  });
}

export interface BudgetStatusItem {
  category: Category;
  limit: number;
  spent: number;
  prevMonthSpent: number;
  pct: number;
  alertLevel: 'ok' | '50' | '80' | '100';
  remaining: number;
}

export function computeBudgetStatuses(
  ym: string,
  budgets: Budget[],
  transactions: Transaction[],
  categories: Category[]
): BudgetStatusItem[] {
  const prevYm = shiftYM(ym, -1);
  const spentMap: Record<string, number> = {};
  const prevSpentMap: Record<string, number> = {};

  for (const tx of transactions) {
    if (tx.type !== 'expense' || tx.status !== 'paid') continue;
    const cid = tx.categoryId || 'outros';
    const txYm = ymOf(tx.date);
    if (txYm === ym) spentMap[cid] = (spentMap[cid] || 0) + tx.amount;
    else if (txYm === prevYm) prevSpentMap[cid] = (prevSpentMap[cid] || 0) + tx.amount;
  }

  const budgetMap = new Map(budgets.map((b) => [b.categoryId, b.limit]));

  return categories
    .filter((c) => c.kind === 'expense')
    .map((category) => {
      const limit = budgetMap.get(category.id) || 0;
      const spent = round2(spentMap[category.id] || 0);
      const prevMonthSpent = round2(prevSpentMap[category.id] || 0);
      const pct = limit > 0 ? (spent / limit) * 100 : 0;
      let alertLevel: BudgetStatusItem['alertLevel'] = 'ok';
      if (limit > 0) {
        if (pct >= 100) alertLevel = '100';
        else if (pct >= 80) alertLevel = '80';
        else if (pct >= 50) alertLevel = '50';
      }
      return {
        category,
        limit,
        spent,
        prevMonthSpent,
        pct,
        alertLevel,
        remaining: round2(limit - spent),
      };
    })
    .filter((item) => item.limit > 0 || item.spent > 0)
    .sort((a, b) => {
      // Prioriza quem tem limite configurado e maior percentual usado
      if (a.limit > 0 && b.limit === 0) return -1;
      if (a.limit === 0 && b.limit > 0) return 1;
      return b.pct - a.pct || b.spent - a.spent;
    });
}

/**
 * Detector inteligente de despesas recorrentes esquecidas:
 * Analisa o histórico de lançamentos de despesas que possuem a mesma descrição normalizada
 * em 2+ meses diferentes (ou que foram marcadas com tag #recorrente) mas que ainda NÃO
 * estão cadastradas na lista oficial de Contas Fixas (bills).
 */
export interface ForgottenRecurringCandidate {
  key: string;
  description: string;
  averageAmount: number;
  categoryId: string;
  occurrences: number;
  lastDate: string;
  suggestedDay: number;
}

export function detectForgottenRecurringExpenses(
  transactions: Transaction[],
  bills: Bill[],
  dismissedKeys: string[]
): ForgottenRecurringCandidate[] {
  const registeredNames = new Set(bills.map((b) => norm(b.name)));
  const dismissed = new Set(dismissedKeys);

  const groups = new Map<
    string,
    {
      displayDesc: string;
      amounts: number[];
      months: Set<string>;
      dates: string[];
      categoryId: string;
    }
  >();

  for (const tx of transactions) {
    if (tx.type !== 'expense' || tx.billId) continue;
    const key = norm(tx.description).replace(/\d+\/\d+/g, '').trim();
    if (!key || key.length < 3) continue;
    if (registeredNames.has(key) || dismissed.has(key)) continue;

    const existing = groups.get(key) || {
      displayDesc: tx.description,
      amounts: [],
      months: new Set<string>(),
      dates: [],
      categoryId: tx.categoryId || 'assinaturas',
    };

    existing.amounts.push(tx.amount);
    existing.months.add(ymOf(tx.date));
    existing.dates.push(tx.date);
    groups.set(key, existing);
  }

  const candidates: ForgottenRecurringCandidate[] = [];
  const subscriptionKeywords = [
    'netflix', 'spotify', 'icloud', 'apple', 'amazon', 'prime', 'disney', 'hbo', 'max',
    'youtube', 'chatgpt', 'openai', 'academia', 'smartfit', 'internet', 'vivo', 'claro',
    'tim', 'aluguel', 'condominio', 'energia', 'luz', 'agua', 'seguro', 'plano de saude',
  ];

  for (const [key, data] of groups.entries()) {
    const looksLikeSubscription = subscriptionKeywords.some((kw) => key.includes(kw));
    if (data.months.size >= 2 || (looksLikeSubscription && data.amounts.length >= 1)) {
      const avg = data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length;
      const sortedDates = [...data.dates].sort();
      const lastDate = sortedDates[sortedDates.length - 1];
      const suggestedDay = Number(lastDate.split('-')[2]) || 10;

      candidates.push({
        key,
        description: data.displayDesc,
        averageAmount: round2(avg),
        categoryId: data.categoryId,
        occurrences: data.amounts.length,
        lastDate,
        suggestedDay,
      });
    }
  }

  return candidates.sort((a, b) => b.occurrences - a.occurrences);
}

// ==================== MATEMÁTICA FINANCEIRA DE DÍVIDAS E QUITAÇÃO ====================

export function monthlyToAnnualInterestPct(monthlyRatePct: number): number {
  const r = Math.max(0, monthlyRatePct) / 100;
  return round2((Math.pow(1 + r, 12) - 1) * 100);
}

export function calculateInstallmentValue(
  balance: number,
  monthlyRatePct: number,
  remainingMonths: number,
  system: AmortizationSystem
): number {
  const pv = Math.max(0, balance);
  const n = Math.max(1, Math.round(remainingMonths));
  const r = Math.max(0, monthlyRatePct) / 100;

  if (pv <= 0) return 0;
  if (r === 0 || system === 'fixed') {
    return round2(pv / n);
  }
  if (system === 'sac') {
    const amort = pv / n;
    const interest = pv * r;
    return round2(amort + interest);
  }
  // Tabela Price
  const factor = Math.pow(1 + r, n);
  const pmt = (pv * r * factor) / (factor - 1);
  return round2(pmt);
}

export interface DebtMetrics {
  remainingInstallments: number;
  progressPct: number;
  annualInterestPct: number;
  nextMonthInterest: number;
  nextMonthPrincipal: number;
  totalRemainingCost: number;
  totalRemainingInterest: number;
}

export function computeDebtMetrics(debt: Debt): DebtMetrics {
  const remainingInstallments = Math.max(0, debt.totalInstallments - debt.paidInstallments);
  const r = Math.max(0, debt.monthlyInterestRate) / 100;
  const annualInterestPct = monthlyToAnnualInterestPct(debt.monthlyInterestRate);

  const progressPct =
    debt.originalAmount > 0
      ? Math.min(
          100,
          Math.max(0, ((debt.originalAmount - debt.currentBalance) / debt.originalAmount) * 100)
        )
      : debt.totalInstallments > 0
      ? (debt.paidInstallments / debt.totalInstallments) * 100
      : 0;

  if (debt.currentBalance <= 0 || remainingInstallments <= 0) {
    return {
      remainingInstallments: 0,
      progressPct: 100,
      annualInterestPct,
      nextMonthInterest: 0,
      nextMonthPrincipal: 0,
      totalRemainingCost: 0,
      totalRemainingInterest: 0,
    };
  }

  const nextMonthInterest = round2(debt.currentBalance * r);
  const nextMonthPrincipal =
    debt.amortizationSystem === 'sac'
      ? round2(debt.currentBalance / remainingInstallments)
      : round2(Math.max(0, debt.monthlyPayment - nextMonthInterest));

  let totalRemainingCost = 0;
  let totalRemainingInterest = 0;

  if (debt.amortizationSystem === 'sac') {
    const constAmort = debt.currentBalance / remainingInstallments;
    let bal = debt.currentBalance;
    for (let m = 0; m < remainingInstallments; m++) {
      const intM = bal * r;
      totalRemainingInterest += intM;
      totalRemainingCost += constAmort + intM;
      bal = Math.max(0, bal - constAmort);
    }
  } else {
    // Price ou Parcela Fixa
    totalRemainingCost = debt.monthlyPayment * remainingInstallments;
    totalRemainingInterest = Math.max(0, totalRemainingCost - debt.currentBalance);
  }

  return {
    remainingInstallments,
    progressPct: round2(progressPct),
    annualInterestPct,
    nextMonthInterest,
    nextMonthPrincipal,
    totalRemainingCost: round2(totalRemainingCost),
    totalRemainingInterest: round2(totalRemainingInterest),
  };
}

export interface PayoffSimulationResult {
  strategy: 'baseline' | 'avalanche' | 'snowball';
  totalMonths: number;
  totalInterestPaid: number;
  totalPaid: number;
  interestSavedVsBaseline: number;
  monthsSavedVsBaseline: number;
  order: Array<{
    id: string;
    name: string;
    monthlyInterestRate: number;
    currentBalance: number;
    paidOffMonth: number;
    interestPaid: number;
  }>;
}

export function simulateDebtPayoff(
  debts: Debt[],
  extraMonthlyAmount: number,
  strategy: 'baseline' | 'avalanche' | 'snowball',
  baselineRef?: { totalMonths: number; totalInterestPaid: number }
): PayoffSimulationResult {
  const active = debts.filter((d) => d.currentBalance > 0.01);
  if (active.length === 0) {
    return {
      strategy,
      totalMonths: 0,
      totalInterestPaid: 0,
      totalPaid: 0,
      interestSavedVsBaseline: 0,
      monthsSavedVsBaseline: 0,
      order: [],
    };
  }

  // Ordenação de prioridade para receber o aporte extra + efeito cascata
  const sorted = [...active].sort((a, b) => {
    if (strategy === 'avalanche') {
      return b.monthlyInterestRate - a.monthlyInterestRate || a.currentBalance - b.currentBalance;
    }
    if (strategy === 'snowball') {
      return a.currentBalance - b.currentBalance || b.monthlyInterestRate - a.monthlyInterestRate;
    }
    return 0;
  });

  const simItems = sorted.map((d) => {
    const rem = Math.max(1, d.totalInstallments - d.paidInstallments);
    const minPmt =
      d.monthlyPayment > 0
        ? d.monthlyPayment
        : calculateInstallmentValue(
            d.currentBalance,
            d.monthlyInterestRate,
            rem,
            d.amortizationSystem
          );
    return {
      id: d.id,
      name: d.name,
      rate: Math.max(0, d.monthlyInterestRate) / 100,
      monthlyInterestRate: d.monthlyInterestRate,
      initialBalance: d.currentBalance,
      balance: d.currentBalance,
      minPayment: Math.max(minPmt, d.currentBalance * (Math.max(0, d.monthlyInterestRate) / 100) + 1),
      interestPaid: 0,
      paidOffMonth: 0,
    };
  });

  const maxMonths = 360; // Teto de segurança de 30 anos
  let month = 0;
  let totalInterestPaid = 0;
  let totalPaid = 0;

  // Orçamento mensal fixo destinado às dívidas = soma das parcelas mínimas + aporte extra (se não for baseline)
  const baseMinimumSum = simItems.reduce((acc, item) => acc + item.minPayment, 0);
  const monthlyBudget =
    strategy === 'baseline' ? baseMinimumSum : baseMinimumSum + Math.max(0, extraMonthlyAmount);

  while (simItems.some((i) => i.balance > 0.01) && month < maxMonths) {
    month++;
    let availableExtra = monthlyBudget;

    // 1. Aplica juros do mês e paga a parcela mínima de cada dívida ativa
    for (const item of simItems) {
      if (item.balance <= 0.01) continue;
      const interest = item.balance * item.rate;
      item.interestPaid += interest;
      totalInterestPaid += interest;
      item.balance += interest;

      const requiredMin = Math.min(item.balance, item.minPayment);
      item.balance -= requiredMin;
      totalPaid += requiredMin;
      availableExtra = Math.max(0, availableExtra - requiredMin);

      if (item.balance <= 0.01 && item.paidOffMonth === 0) {
        item.balance = 0;
        item.paidOffMonth = month;
      }
    }

    // 2. Se for Avalanche ou Snowball, direciona toda a sobra (aporte extra + parcelas de dívidas já quitadas) na prioridade #1
    if (strategy !== 'baseline' && availableExtra > 0.01) {
      for (const item of simItems) {
        if (item.balance <= 0.01) continue;
        const extraPayment = Math.min(item.balance, availableExtra);
        item.balance -= extraPayment;
        totalPaid += extraPayment;
        availableExtra -= extraPayment;

        if (item.balance <= 0.01 && item.paidOffMonth === 0) {
          item.balance = 0;
          item.paidOffMonth = month;
        }
        if (availableExtra <= 0.01) break;
      }
    }
  }

  for (const item of simItems) {
    if (item.paidOffMonth === 0) item.paidOffMonth = month;
  }

  const interestSaved = baselineRef
    ? Math.max(0, round2(baselineRef.totalInterestPaid - totalInterestPaid))
    : 0;
  const monthsSaved = baselineRef ? Math.max(0, baselineRef.totalMonths - month) : 0;

  return {
    strategy,
    totalMonths: month,
    totalInterestPaid: round2(totalInterestPaid),
    totalPaid: round2(totalPaid),
    interestSavedVsBaseline: interestSaved,
    monthsSavedVsBaseline: monthsSaved,
    order: simItems.map((i) => ({
      id: i.id,
      name: i.name,
      monthlyInterestRate: i.monthlyInterestRate,
      currentBalance: i.initialBalance,
      paidOffMonth: i.paidOffMonth,
      interestPaid: round2(i.interestPaid),
    })),
  };
}

