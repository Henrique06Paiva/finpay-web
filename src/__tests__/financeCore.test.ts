import { describe, expect, it } from 'vitest';
import {
  getBrazilianHolidays,
  getFifthBusinessDay,
  getLastBusinessDay,
  isBusinessDay,
  parseISO,
} from '../utils/date';
import {
  calculatePayrollMonth,
  calculateProgressiveINSS,
  calculateProgressiveIRRF,
  ensurePayrollTransaction,
} from '../services/payrollService';
import {
  decryptBackupPayload,
  encryptBackupPayload,
  hashPin,
} from '../services/securityService';
import {
  autoCategorizeTransaction,
  parseCsvStatement,
  parseOfxStatement,
} from '../services/openFinanceService';
import {
  calculateInstallmentValue,
  simulateDebtPayoff,
} from '../utils/analytics';
import { Debt, PayrollConfig } from '../types/finance';

describe('Calendário Bancário & Feriados Nacionais (date.ts)', () => {
  it('identifica feriados nacionais fixos e móveis (Carnaval, Sexta-feira Santa, Corpus Christi)', () => {
    const holidays2026 = getBrazilianHolidays(2026);
    expect(holidays2026.has('2026-01-01')).toBe(true); // Ano Novo
    expect(holidays2026.has('2026-02-17')).toBe(true); // Terça de Carnaval 2026
    expect(holidays2026.has('2026-04-03')).toBe(true); // Sexta-feira Santa 2026
    expect(holidays2026.has('2026-06-04')).toBe(true); // Corpus Christi 2026
    expect(holidays2026.has('2026-11-20')).toBe(true); // Consciência Negra
    expect(holidays2026.has('2026-12-25')).toBe(true); // Natal
  });

  it('recua corretamente o último dia útil quando o mês termina no fim de semana', () => {
    // Outubro 2026 termina no sábado (31/10/2026) -> deve recuar para sexta (30/10/2026)
    expect(getLastBusinessDay('2026-10')).toBe('2026-10-30');
    // Maio 2026 termina no domingo (31/05/2026) -> deve recuar para sexta (29/05/2026)
    expect(getLastBusinessDay('2026-05')).toBe('2026-05-29');
  });

  it('calcula o 5º dia útil pulando fins de semana e feriados nacionais', () => {
    // Janeiro 2026: 01/01 é feriado (quinta), 02/01 (1º), 05/01 (2º), 06/01 (3º), 07/01 (4º), 08/01 (5º)
    expect(getFifthBusinessDay('2026-01')).toBe('2026-01-08');
    expect(isBusinessDay(parseISO('2026-01-01'))).toBe(false);
  });
});

describe('Motor de Folha CLT, INSS e IRRF Progressivos (payrollService.ts)', () => {
  it('calcula o INSS progressivo exatamente como na tabela CLT oficial', () => {
    // R$ 2.500,00 -> 9% - 24,32 = R$ 200,68
    expect(calculateProgressiveINSS(2500)).toBe(200.68);
    expect(calculateProgressiveINSS(1500)).toBe(112.5);
    expect(calculateProgressiveINSS(0)).toBe(0);
  });

  it('calcula isenção e faixas progressivas de IRRF com desconto simplificado', () => {
    // Até R$ 3.036 bruto (base <= 2.428,80 após desconto simplificado de 607,20) é isento
    expect(calculateProgressiveIRRF(2500)).toBe(0);
    // Salário mais alto deve ter retenção positiva
    expect(calculateProgressiveIRRF(6500)).toBeGreaterThan(0);
  });

  it('consolida proventos, descontos fixos, ajustes do mês e lançamento idempotente', () => {
    const samplePayroll: PayrollConfig = {
      enabled: true,
      employerName: 'TechCorp Brasil S.A.',
      role: 'Engenheiro de Software',
      grossSalary: 5000,
      deductions: [
        { id: 'inss', code: '2103', name: 'INSS Oficial', amount: calculateProgressiveINSS(5000) },
        { id: 'vr', code: '2076', name: 'Vale-Refeição', amount: 120 },
      ],
      monthlyAdjustments: {
        '2026-10': [{ id: 'bonus', name: 'Hora Extra', amount: 300, type: 'earning' }],
      },
      payDayRule: 'last_business_day',
      accountId: 'principal',
    };

    const calc = calculatePayrollMonth(samplePayroll, '2026-10');
    expect(calc.payDate).toBe('2026-10-30');
    expect(calc.totalEarnings).toBe(5300);

    const { nextTransactions, updatedOrCreated } = ensurePayrollTransaction(
      samplePayroll,
      '2026-10',
      []
    );
    expect(updatedOrCreated).toBe(true);
    expect(nextTransactions).toHaveLength(1);
    expect(nextTransactions[0].amount).toBe(calc.netSalary);
    expect(nextTransactions[0].payrollYm).toBe('2026-10');
  });
});

describe('Segurança & Criptografia AES-GCM 256-bit (securityService.ts)', () => {
  it('gera hash SHA-256 determinístico para o PIN e criptografa/descriptografa backups', async () => {
    const h1 = await hashPin('1234');
    const h2 = await hashPin('1234');
    const h3 = await hashPin('9999');
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);

    const secretPayload = JSON.stringify({ accounts: [{ name: 'Conta Secreta', balance: 42000 }] });
    const encrypted = await encryptBackupPayload(secretPayload, 'minha-senha-forte');
    expect(encrypted).not.toContain('Conta Secreta');
    expect(JSON.parse(encrypted).auraEncryptedBackup).toBe(true);

    const decrypted = await decryptBackupPayload(encrypted, 'minha-senha-forte');
    expect(decrypted).toBe(secretPayload);
  });
});

describe('Parsers OFX/CSV e Categorização Inteligente (openFinanceService.ts)', () => {
  it('categoriza descrições bancárias brasileiras automaticamente', () => {
    expect(autoCategorizeTransaction('UBER *TRIP SAO PAULO', 'expense').categoryId).toBe('transporte');
    expect(autoCategorizeTransaction('IFOOD *RESTAURANTE', 'expense').categoryId).toBe('alimentacao');
    expect(autoCategorizeTransaction('NETFLIX.COM', 'expense').categoryId).toBe('assinaturas');
  });

  it('faz parse de extratos OFX e CSV sem duplicar IDs externos', () => {
    const sampleOfx = `
      <STMTTRN>
        <TRNTYPE>DEBIT
        <DTPOSTED>20261015120000
        <TRNAMT>-89.90
        <FITID>FIT-2026-001
        <MEMO>SUPERMERCADO EXTRA
      </STMTTRN>
    `;
    const parsedOfx = parseOfxStatement(sampleOfx, []);
    expect(parsedOfx.transactions).toHaveLength(1);
    expect(parsedOfx.transactions[0].amount).toBe(89.9);
    expect(parsedOfx.transactions[0].categoryId).toBe('mercado');

    const sampleCsv = 'Data,Valor,Identificador,Descrição\n18/10/2026,-45.50,ID-99,UBER TRIP';
    const parsedCsv = parseCsvStatement(sampleCsv, []);
    expect(parsedCsv.transactions).toHaveLength(1);
    expect(parsedCsv.transactions[0].amount).toBe(45.5);
    expect(parsedCsv.transactions[0].categoryId).toBe('transporte');
  });
});

describe('Amortização Price/SAC e Simulação Avalanche vs. Bola de Neve (analytics.ts)', () => {
  it('calcula parcelas na Tabela Price e SAC e economiza juros com aporte extra', () => {
    const pmtPrice = calculateInstallmentValue(10000, 2, 12, 'price');
    const pmtSac = calculateInstallmentValue(10000, 2, 12, 'sac');
    expect(pmtPrice).toBeGreaterThan(800);
    expect(pmtSac).toBeGreaterThan(pmtPrice); // 1ª parcela SAC é maior que Price

    const debts: Debt[] = [
      {
        id: 'd1',
        name: 'Cartão Rotativo',
        creditor: 'Banco A',
        kind: 'credit_card',
        amortizationSystem: 'price',
        originalAmount: 3000,
        currentBalance: 2500,
        monthlyInterestRate: 8.5,
        totalInstallments: 12,
        paidInstallments: 2,
        monthlyPayment: 350,
        dueDay: 10,
        accountId: 'principal',
        createdAt: Date.now(),
      },
      {
        id: 'd2',
        name: 'Empréstimo Consignado',
        creditor: 'Banco B',
        kind: 'consigned',
        amortizationSystem: 'price',
        originalAmount: 5000,
        currentBalance: 4000,
        monthlyInterestRate: 1.5,
        totalInstallments: 24,
        paidInstallments: 4,
        monthlyPayment: 250,
        dueDay: 25,
        accountId: 'principal',
        createdAt: Date.now(),
      },
    ];

    const baseline = simulateDebtPayoff(debts, 0, 'baseline');
    const avalanche = simulateDebtPayoff(debts, 400, 'avalanche', baseline);
    const snowball = simulateDebtPayoff(debts, 400, 'snowball', baseline);
    expect(avalanche.interestSavedVsBaseline).toBeGreaterThan(0);
    expect(avalanche.monthsSavedVsBaseline).toBeGreaterThan(0);
    expect(avalanche.totalInterestPaid).toBeLessThanOrEqual(snowball.totalInterestPaid);
  });
});
