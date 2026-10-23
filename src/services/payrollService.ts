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
 * Tabela progressiva oficial de contribuição do INSS (CLT 2026)
 */
export function calculateProgressiveINSS(grossSalary: number): number {
  const gross = Math.max(0, grossSalary || 0);
  if (gross <= 0) return 0;

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
 * Calcula o IRRF com o maior benefício entre deduções legais e desconto simplificado
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
  const simplifiedDiscount = 607.2;
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

/**
 * Estrutura de simulação completa de Férias CLT
 */
export interface VacationSimulation {
  vacationDays: number; // 20 ou 30 dias
  sell10Days: boolean; // Abono pecuniário
  baseSalary: number;
  salaryVacationDays: number;
  oneThirdConstitutional: number;
  grossVacationPay: number;
  inssDiscount: number;
  irrfDiscount: number;
  netVacationPay: number;
  // Abono pecuniário (venda de 10 dias de férias é isenta de INSS e IRRF)
  allowanceGross: number;
  allowanceOneThird: number;
  allowanceTotalTaxFree: number;
  // Total líquido creditado na conta do trabalhador
  totalTakeHomePay: number;
}

export function simulateVacations(
  grossSalary: number,
  vacationDays = 30,
  sell10Days = false,
  dependentsCount = 0
): VacationSimulation {
  const base = Math.max(0, grossSalary);
  const daysTaken = sell10Days ? 20 : vacationDays;

  // Remuneração dos dias de férias gozados
  const salaryVacationDays = round2((base / 30) * daysTaken);
  const oneThirdConstitutional = round2(salaryVacationDays / 3);
  const grossVacationPay = round2(salaryVacationDays + oneThirdConstitutional);

  // Tributação sobre os dias de férias gozados
  const inssDiscount = calculateProgressiveINSS(grossVacationPay);
  const irrfDiscount = calculateProgressiveIRRF(grossVacationPay, inssDiscount, dependentsCount);
  const netVacationPay = round2(Math.max(0, grossVacationPay - inssDiscount - irrfDiscount));

  // Venda de 10 dias (Abono pecuniário - Isento de encargos por jurisprudência STJ)
  let allowanceGross = 0;
  let allowanceOneThird = 0;
  let allowanceTotalTaxFree = 0;

  if (sell10Days) {
    allowanceGross = round2((base / 30) * 10);
    allowanceOneThird = round2(allowanceGross / 3);
    allowanceTotalTaxFree = round2(allowanceGross + allowanceOneThird);
  }

  const totalTakeHomePay = round2(netVacationPay + allowanceTotalTaxFree);

  return {
    vacationDays: daysTaken,
    sell10Days,
    baseSalary: base,
    salaryVacationDays,
    oneThirdConstitutional,
    grossVacationPay,
    inssDiscount,
    irrfDiscount,
    netVacationPay,
    allowanceGross,
    allowanceOneThird,
    allowanceTotalTaxFree,
    totalTakeHomePay,
  };
}

/**
 * Estrutura de simulação do 13º Salário (1ª e 2ª parcelas)
 */
export interface ThirteenthSalarySimulation {
  monthsWorked: number; // 1 a 12
  fullYearGross: number;
  proportionalGross: number;
  // 1ª Parcela (paga até 30/nov - SEM descontos)
  firstInstallment: number;
  // 2ª Parcela (paga até 20/dez - COM descontos sobre o total)
  totalInss: number;
  totalIrrf: number;
  secondInstallmentGross: number;
  secondInstallmentNet: number;
  totalNetReceived: number;
}

export function simulateThirteenthSalary(
  grossSalary: number,
  monthsWorked = 12,
  dependentsCount = 0
): ThirteenthSalarySimulation {
  const base = Math.max(0, grossSalary);
  const months = Math.min(12, Math.max(1, monthsWorked));
  const proportionalGross = round2((base / 12) * months);

  // 1ª Parcela = 50% do proporcional (Sem INSS e Sem IRRF)
  const firstInstallment = round2(proportionalGross * 0.5);

  // Descontos incidem sobre a totalidade do 13º proporcional
  const totalInss = calculateProgressiveINSS(proportionalGross);
  const totalIrrf = calculateProgressiveIRRF(proportionalGross, totalInss, dependentsCount);

  // 2ª Parcela = Restante bruto menos todos os descontos
  const secondInstallmentGross = round2(proportionalGross - firstInstallment);
  const secondInstallmentNet = round2(Math.max(0, secondInstallmentGross - totalInss - totalIrrf));
  const totalNetReceived = round2(firstInstallment + secondInstallmentNet);

  return {
    monthsWorked: months,
    fullYearGross: base,
    proportionalGross,
    firstInstallment,
    totalInss,
    totalIrrf,
    secondInstallmentGross,
    secondInstallmentNet,
    totalNetReceived,
  };
}

export type SeveranceReason =
  | 'dismissal_without_cause' // Sem justa causa
  | 'resignation' // Pedido de demissão
  | 'mutual_agreement'; // Acordo mútuo (art. 484-A)

/**
 * Estrutura de simulação de Rescisão Trabalhista CLT
 */
export interface SeveranceSimulation {
  reason: SeveranceReason;
  baseSalary: number;
  daysWorkedInMonth: number;
  monthsWorkedInYear: number;
  totalYearsEmployed: number;
  // Verbas rescisórias
  balanceOfSalary: number;
  noticeIndemnified: number; // Aviso prévio
  vacationAccrued: number; // Férias vencidas
  vacationProportional: number; // Férias proporcionais + 1/3
  thirteenthProportional: number;
  grossSeverance: number;
  // Descontos
  inssOnSalary: number;
  irrfOnSalary: number;
  totalDeductions: number;
  netSeveranceDirectPay: number; // Valor pago diretamente na rescisão
  // FGTS e Multa
  estimatedFgtsBalance: number;
  fgtsFinePercent: number; // 40% (sem justa causa), 20% (acordo), 0% (demissão voluntária)
  fgtsFineAmount: number;
  totalWithFgtsAndFine: number; // Montante financeiro global recebido
}

export function simulateSeverance(
  grossSalary: number,
  reason: SeveranceReason = 'dismissal_without_cause',
  params: {
    daysWorkedInMonth?: number;
    monthsWorkedInYear?: number;
    totalYearsEmployed?: number;
    hasAccruedVacation?: boolean;
    noticeIndemnified?: boolean;
    dependentsCount?: number;
  } = {}
): SeveranceSimulation {
  const base = Math.max(0, grossSalary);
  const daysWorked = params.daysWorkedInMonth ?? 30;
  const monthsInYear = params.monthsWorkedInYear ?? 8;
  const yearsEmployed = Math.max(0, params.totalYearsEmployed ?? 2);
  const hasAccruedVac = params.hasAccruedVacation ?? false;
  const isIndemnified = params.noticeIndemnified ?? true;
  const deps = params.dependentsCount ?? 0;

  // 1. Saldo de salário dos dias trabalhados no mês
  const balanceOfSalary = round2((base / 30) * Math.min(30, daysWorked));
  const inssOnSalary = calculateProgressiveINSS(balanceOfSalary);
  const irrfOnSalary = calculateProgressiveIRRF(balanceOfSalary, inssOnSalary, deps);

  // 2. Aviso Prévio Indenizado (Lei 12.506/2011: 30 dias + 3 dias por ano completo trabalhado)
  let noticeDays = 0;
  let noticeIndemnified = 0;
  if (reason === 'dismissal_without_cause') {
    noticeDays = isIndemnified ? Math.min(90, 30 + yearsEmployed * 3) : 0;
    noticeIndemnified = round2((base / 30) * noticeDays);
  } else if (reason === 'mutual_agreement') {
    noticeDays = isIndemnified ? Math.round((30 + yearsEmployed * 3) / 2) : 0;
    noticeIndemnified = round2((base / 30) * noticeDays);
  }

  // 3. Férias Vencidas + 1/3 (se houver)
  const vacationAccrued = hasAccruedVac ? round2(base + base / 3) : 0;

  // 4. Férias Proporcionais + 1/3
  const propVacationBase = (base / 12) * Math.min(12, monthsInYear);
  const vacationProportional = round2(propVacationBase + propVacationBase / 3);

  // 5. 13º Salário Proporcional
  let thirteenthProportional = 0;
  if (reason !== 'dismissal_without_cause' && reason !== 'resignation' && reason !== 'mutual_agreement') {
    thirteenthProportional = 0;
  } else {
    thirteenthProportional = round2((base / 12) * Math.min(12, monthsInYear));
  }

  const grossSeverance = round2(
    balanceOfSalary + noticeIndemnified + vacationAccrued + vacationProportional + thirteenthProportional
  );

  const totalDeductions = round2(inssOnSalary + irrfOnSalary);
  const netSeveranceDirectPay = round2(Math.max(0, grossSeverance - totalDeductions));

  // 6. FGTS e Multa Rescisória (Estimativa: ~8% do salário por mês trabalhado ao longo dos anos)
  const totalMonthsEmployed = Math.max(1, yearsEmployed * 12 + monthsInYear);
  const estimatedFgtsBalance = round2(base * 0.08 * totalMonthsEmployed);

  let fgtsFinePercent = 0;
  if (reason === 'dismissal_without_cause') {
    fgtsFinePercent = 40;
  } else if (reason === 'mutual_agreement') {
    fgtsFinePercent = 20;
  }

  const fgtsFineAmount = round2(estimatedFgtsBalance * (fgtsFinePercent / 100));
  const totalWithFgtsAndFine = round2(
    netSeveranceDirectPay + (reason === 'resignation' ? 0 : estimatedFgtsBalance + fgtsFineAmount)
  );

  return {
    reason,
    baseSalary: base,
    daysWorkedInMonth: daysWorked,
    monthsWorkedInYear: monthsInYear,
    totalYearsEmployed: yearsEmployed,
    balanceOfSalary,
    noticeIndemnified,
    vacationAccrued,
    vacationProportional,
    thirteenthProportional,
    grossSeverance,
    inssOnSalary,
    irrfOnSalary,
    totalDeductions,
    netSeveranceDirectPay,
    estimatedFgtsBalance,
    fgtsFinePercent,
    fgtsFineAmount,
    totalWithFgtsAndFine,
  };
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
