import {
  PayrollAdjustment,
  PayrollConfig,
  Transaction,
} from '../types/finance';
import {
  daysInMonth,
  getFifthBusinessDay,
  getLastBusinessDay,
  pad,
  todayISO,
} from '../utils/date';
import { formatBRL, round2 } from '../utils/format';

/**
 * Calcula a contribuição oficial progressiva do INSS (Tabela CLT 2026)
 */
export function calculateProgressiveINSS(grossSalary: number): number {
  const gross = Math.max(0, grossSalary || 0);
  if (gross <= 0) return 0;

  // Faixas progressivas CLT 2026 (7,5%, 9%, 12%, 14%)
  const brackets = [
    { limit: 1621.33, rate: 0.075, deduction: 0 },
    { limit: 2902.84, rate: 0.09, deduction: 24.32 },
    { limit: 4354.27, rate: 0.12, deduction: 111.41 },
    { limit: 8475.55, rate: 0.14, deduction: 198.49 },
  ];

  const capped = Math.min(gross, brackets[brackets.length - 1].limit);
  for (const b of brackets) {
    if (capped <= b.limit) {
      return round2(Math.max(0, capped * b.rate - b.deduction));
    }
  }
  const last = brackets[brackets.length - 1];
  return round2(last.limit * last.rate - last.deduction);
}

/**
 * Calcula o Imposto de Renda Retido na Fonte (IRRF) considerando o maior benefício
 * entre as deduções legais (INSS + dependentes) e o desconto simplificado mensal.
 */
export function calculateProgressiveIRRF(
  grossSalary: number,
  inssAmount?: number,
  dependentsCount = 0
): number {
  const gross = Math.max(0, grossSalary || 0);
  if (gross <= 0) return 0;

  const inss = inssAmount ?? calculateProgressiveINSS(gross);
  const legalDeductions = inss + Math.max(0, dependentsCount) * 189.59;
  const simplifiedDiscount = 607.2; // Desconto simplificado mensal
  const effectiveDeduction = Math.max(legalDeductions, simplifiedDiscount);
  const base = Math.max(0, gross - effectiveDeduction);

  const irBrackets = [
    { limit: 2428.8, rate: 0, deduction: 0 },
    { limit: 2826.65, rate: 0.075, deduction: 182.16 },
    { limit: 3751.05, rate: 0.15, deduction: 394.16 },
    { limit: 4664.68, rate: 0.225, deduction: 675.49 },
    { limit: Infinity, rate: 0.275, deduction: 908.73 },
  ];

  for (const b of irBrackets) {
    if (base <= b.limit) {
      return round2(Math.max(0, base * b.rate - b.deduction));
    }
  }
  return 0;
}

export interface PayrollMonthCalculation {
  ym: string;
  grossSalary: number;
  fixedDeductionsSum: number;
  monthlyEarningsSum: number;
  monthlyDeductionsSum: number;
  totalEarnings: number;
  totalDeductions: number;
  netSalary: number;
  payDate: string; // YYYY-MM-DD
  isPastOrToday: boolean;
  notesSummary: string;
  adjustments: PayrollAdjustment[];
}

export function calculatePayrollMonth(
  payroll: PayrollConfig,
  ym: string
): PayrollMonthCalculation {
  const gross = Math.max(0, payroll.grossSalary || 0);

  const fixedDeductionsSum = round2(
    payroll.deductions.reduce((acc, d) => acc + (d.amount || 0), 0)
  );

  const adjustments = payroll.monthlyAdjustments?.[ym] || [];
  let monthlyEarningsSum = 0;
  let monthlyDeductionsSum = 0;

  for (const adj of adjustments) {
    if (adj.type === 'earning') {
      monthlyEarningsSum += adj.amount;
    } else {
      monthlyDeductionsSum += adj.amount;
    }
  }

  const totalEarnings = round2(gross + monthlyEarningsSum);
  const totalDeductions = round2(fixedDeductionsSum + monthlyDeductionsSum);
  const netSalary = Math.max(0, round2(totalEarnings - totalDeductions));

  // Cálculo da data exata de pagamento
  let payDate: string;
  if (payroll.payDayRule === 'fifth_business_day') {
    payDate = getFifthBusinessDay(ym);
  } else if (payroll.payDayRule === 'last_day') {
    payDate = `${ym}-${pad(daysInMonth(ym))}`;
  } else {
    // Padrão: Último dia útil do mês
    payDate = getLastBusinessDay(ym);
  }

  const isPastOrToday = payDate <= todayISO();

  // Monta resumo detalhado para as notas da transação
  const lines: string[] = [
    `Salário Bruto: ${formatBRL(gross)}`,
    ...payroll.deductions.map(
      (d) => `${d.name}: -${formatBRL(d.amount)}`
    ),
  ];
  if (monthlyEarningsSum > 0) {
    lines.push(`Adicionais / Extras: +${formatBRL(monthlyEarningsSum)}`);
  }
  if (monthlyDeductionsSum > 0) {
    lines.push(`Descontos variáveis: -${formatBRL(monthlyDeductionsSum)}`);
  }
  lines.push(`Líquido a Receber: ${formatBRL(netSalary)}`);

  return {
    ym,
    grossSalary: gross,
    fixedDeductionsSum,
    monthlyEarningsSum: round2(monthlyEarningsSum),
    monthlyDeductionsSum: round2(monthlyDeductionsSum),
    totalEarnings,
    totalDeductions,
    netSalary,
    payDate,
    isPastOrToday,
    notesSummary: lines.join(' | '),
    adjustments,
  };
}

/**
 * Garante que exista um lançamento de Salário Líquido gerado automaticamente
 * para o mês especificado, sincronizado com as regras do holerite.
 */
export function ensurePayrollTransaction(
  payroll: PayrollConfig,
  ym: string,
  transactions: Transaction[]
): { nextTransactions: Transaction[]; updatedOrCreated: boolean } {
  if (!payroll.enabled || payroll.grossSalary <= 0) {
    return { nextTransactions: transactions, updatedOrCreated: false };
  }

  const calc = calculatePayrollMonth(payroll, ym);
  if (calc.netSalary <= 0) {
    return { nextTransactions: transactions, updatedOrCreated: false };
  }

  const existingIdx = transactions.findIndex(
    (t) => t.payrollYm === ym || (t.tags?.includes('holerite') && t.date.slice(0, 7) === ym)
  );

  const desc = payroll.employerName
    ? `Salário Líquido (${payroll.employerName.split(' ')[0]})`
    : 'Salário Líquido (Holerite CLT)';

  if (existingIdx >= 0) {
    const existing = transactions[existingIdx];
    // Se o valor, data ou notas mudaram, atualiza
    if (
      Math.abs(existing.amount - calc.netSalary) > 0.01 ||
      existing.date !== calc.payDate ||
      existing.notes !== calc.notesSummary
    ) {
      const updatedList = [...transactions];
      updatedList[existingIdx] = {
        ...existing,
        amount: calc.netSalary,
        date: calc.payDate,
        notes: calc.notesSummary,
        status: calc.isPastOrToday ? 'paid' : existing.status,
      };
      return { nextTransactions: updatedList, updatedOrCreated: true };
    }
    return { nextTransactions: transactions, updatedOrCreated: false };
  }

  // Cria o lançamento automático para o mês
  const newTx: Transaction = {
    id: `tx-salary-${ym}`,
    type: 'income',
    description: desc,
    amount: calc.netSalary,
    date: calc.payDate,
    categoryId: 'salario',
    accountId: payroll.accountId || 'principal',
    paymentMethod: 'transfer',
    status: calc.isPastOrToday ? 'paid' : 'pending',
    tags: ['salario', 'clt', 'holerite'],
    notes: calc.notesSummary,
    payrollYm: ym,
    createdAt: Date.now(),
  };

  return {
    nextTransactions: [newTx, ...transactions],
    updatedOrCreated: true,
  };
}
