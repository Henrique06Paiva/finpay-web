import { describe, it, expect } from 'vitest';
import {
  calculateProgressiveINSS,
  calculateProgressiveIRRF,
  simulateThirteenthSalary,
  simulateVacations,
  simulateSeverance,
} from '../services/payrollService';

describe('CLT Advanced Intelligence Suite (Férias, 13º e Rescisão)', () => {
  const SALARIO_TESTE = 6000.0;

  it('deve simular férias de 30 dias com 1/3 constitucional e deduções corretas', () => {
    const sim = simulateVacations(SALARIO_TESTE, 30, false);

    expect(sim.baseSalary).toBe(6000.0);
    expect(sim.salaryVacationDays).toBe(6000.0);
    expect(sim.oneThirdConstitutional).toBe(2000.0); // 1/3 de 6000
    expect(sim.grossVacationPay).toBe(8000.0);
    expect(sim.inssDiscount).toBeGreaterThan(0);
    expect(sim.irrfDiscount).toBeGreaterThan(0);
    expect(sim.totalTakeHomePay).toBe(sim.netVacationPay);
  });

  it('deve calcular venda de 10 dias de férias (abono pecuniário) com isenção fiscal', () => {
    const sim = simulateVacations(SALARIO_TESTE, 30, true);

    expect(sim.sell10Days).toBe(true);
    expect(sim.vacationDays).toBe(20);
    expect(sim.allowanceGross).toBe(2000.0); // 10 dias de 6000
    expect(sim.allowanceOneThird).toBeCloseTo(666.67, 1);
    expect(sim.allowanceTotalTaxFree).toBeCloseTo(2666.67, 1);
    expect(sim.totalTakeHomePay).toBe(sim.netVacationPay + sim.allowanceTotalTaxFree);
  });

  it('deve simular 13º salário com 1ª parcela bruta integral e 2ª parcela com tributação exclusiva', () => {
    const sim = simulateThirteenthSalary(SALARIO_TESTE, 12);

    expect(sim.proportionalGross).toBe(6000.0);
    expect(sim.firstInstallment).toBe(3000.0); // 50% bruto sem descontos
    expect(sim.totalInss).toBeGreaterThan(0);
    expect(sim.secondInstallmentNet).toBeLessThan(3000.0); // 3000 - descontos
    expect(sim.totalNetReceived).toBe(sim.firstInstallment + sim.secondInstallmentNet);
  });

  it('deve simular rescisão sem justa causa com multa rescisória de 40% do FGTS e aviso indenizado', () => {
    const sim = simulateSeverance(SALARIO_TESTE, 'dismissal_without_cause', {
      totalYearsEmployed: 3,
      monthsWorkedInYear: 6,
      noticeIndemnified: true,
      hasAccruedVacation: false,
    });

    expect(sim.fgtsFinePercent).toBe(40);
    expect(sim.noticeIndemnified).toBeGreaterThan(0);
    expect(sim.thirteenthProportional).toBe(3000.0); // 6/12 de 6000
    expect(sim.estimatedFgtsBalance).toBeGreaterThan(0);
    expect(sim.fgtsFineAmount).toBeCloseTo(sim.estimatedFgtsBalance * 0.4, 1);
    expect(sim.totalWithFgtsAndFine).toBeGreaterThan(sim.netSeveranceDirectPay);
  });

  it('deve calcular rescisão por pedido de demissão sem liberação de multa FGTS', () => {
    const sim = simulateSeverance(SALARIO_TESTE, 'resignation', {
      totalYearsEmployed: 2,
      monthsWorkedInYear: 4,
    });

    expect(sim.fgtsFinePercent).toBe(0);
    expect(sim.noticeIndemnified).toBe(0);
    expect(sim.totalWithFgtsAndFine).toBe(sim.netSeveranceDirectPay);
  });
});
