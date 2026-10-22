import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  Calculator,
  CheckCircle2,
  Flame,
  Percent,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingDown,
  Zap,
} from 'lucide-react';
import {
  Account,
  AmortizationSystem,
  Debt,
  DebtKind,
} from '../types/finance';
import { AMORTIZATION_LABEL, DEBT_KIND_LABEL } from '../data/defaults';
import {
  calculateInstallmentValue,
  computeDebtMetrics,
  monthlyToAnnualInterestPct,
  simulateDebtPayoff,
} from '../utils/analytics';
import { formatBRL, formatCompactBRL, formatPct, parseMoney, round2 } from '../utils/format';

interface DebtsTabProps {
  debts: Debt[];
  accounts: Account[];
  hideBalances: boolean;
  onAddDebt: (debt: Omit<Debt, 'id' | 'createdAt'>) => void;
  onPayInstallment: (debt: Debt) => void;
  onAmortizeDebt: (
    debtId: string,
    extraAmount: number,
    mode: 'reduce_term' | 'reduce_payment'
  ) => void;
  onDeleteDebt: (debtId: string) => void;
}

export const DebtsTab: React.FC<DebtsTabProps> = ({
  debts,
  accounts,
  hideBalances,
  onAddDebt,
  onPayInstallment,
  onAmortizeDebt,
  onDeleteDebt,
}) => {
  const [subTab, setSubTab] = useState<'list' | 'simulator'>('list');
  const [showNewModal, setShowNewModal] = useState(false);

  // Estado para amortização extra inline em um card
  const [amortizingId, setAmortizingId] = useState<string | null>(null);
  const [amortizeAmount, setAmortizeAmount] = useState('');
  const [amortizeMode, setAmortizeMode] = useState<'reduce_term' | 'reduce_payment'>(
    'reduce_term'
  );

  // Estado do Simulador de Estratégias de Quitação
  const [extraMonthlyInput, setExtraMonthlyInput] = useState('300');
  const [selectedStrategy, setSelectedStrategy] = useState<'avalanche' | 'snowball'>(
    'avalanche'
  );

  // Campos do Modal Nova Dívida
  const [name, setName] = useState('');
  const [creditor, setCreditor] = useState('');
  const [kind, setKind] = useState<DebtKind>('loan');
  const [system, setSystem] = useState<AmortizationSystem>('price');
  const [currentBalance, setCurrentBalance] = useState('');
  const [originalAmount, setOriginalAmount] = useState('');
  const [monthlyRate, setMonthlyRate] = useState('1,99');
  const [totalInstallments, setTotalInstallments] = useState('24');
  const [paidInstallments, setPaidInstallments] = useState('0');
  const [monthlyPayment, setMonthlyPayment] = useState('');
  const [dueDay, setDueDay] = useState('10');
  const [accountId, setAccountId] = useState(accounts[0]?.id || 'principal');

  // Cálculo automático de sugestão de parcela no modal
  const suggestedInstallment = useMemo(() => {
    const bal = parseMoney(currentBalance);
    const rate = parseMoney(monthlyRate);
    const total = Math.max(1, Number(totalInstallments) || 1);
    const paid = Math.max(0, Number(paidInstallments) || 0);
    const rem = Math.max(1, total - paid);
    if (bal <= 0) return 0;
    return calculateInstallmentValue(bal, rate, rem, system);
  }, [currentBalance, monthlyRate, totalInstallments, paidInstallments, system]);

  // Resumo Geral das Dívidas
  const summary = useMemo(() => {
    const activeDebts = debts.filter((d) => d.currentBalance > 0.01);
    let totalBalance = 0;
    let totalOriginal = 0;
    let totalMonthlyPayment = 0;
    let totalRemainingInterest = 0;
    let weightedRateNumerator = 0;

    for (const d of activeDebts) {
      const m = computeDebtMetrics(d);
      totalBalance += d.currentBalance;
      totalOriginal += Math.max(d.originalAmount, d.currentBalance);
      totalMonthlyPayment += d.monthlyPayment;
      totalRemainingInterest += m.totalRemainingInterest;
      weightedRateNumerator += d.currentBalance * d.monthlyInterestRate;
    }

    const avgMonthlyRate = totalBalance > 0 ? weightedRateNumerator / totalBalance : 0;
    const overallProgressPct =
      totalOriginal > 0
        ? Math.min(100, Math.max(0, ((totalOriginal - totalBalance) / totalOriginal) * 100))
        : 0;

    return {
      activeCount: activeDebts.length,
      totalBalance: round2(totalBalance),
      totalMonthlyPayment: round2(totalMonthlyPayment),
      totalRemainingInterest: round2(totalRemainingInterest),
      avgMonthlyRate: round2(avgMonthlyRate),
      avgAnnualRate: monthlyToAnnualInterestPct(avgMonthlyRate),
      overallProgressPct: round2(overallProgressPct),
    };
  }, [debts]);

  // Simulações de Quitação (Plano Atual vs Avalanche vs Bola de Neve)
  const simulations = useMemo(() => {
    const extra = Math.max(0, parseMoney(extraMonthlyInput) || 0);
    const baseline = simulateDebtPayoff(debts, 0, 'baseline');
    const avalanche = simulateDebtPayoff(debts, extra, 'avalanche', baseline);
    const snowball = simulateDebtPayoff(debts, extra, 'snowball', baseline);
    return {
      extra,
      baseline,
      avalanche,
      snowball,
      activeSim: selectedStrategy === 'avalanche' ? avalanche : snowball,
    };
  }, [debts, extraMonthlyInput, selectedStrategy]);

  const handleCreateDebt = (e: React.FormEvent) => {
    e.preventDefault();
    const bal = parseMoney(currentBalance);
    if (!name.trim() || bal <= 0) return;

    const orig = Math.max(bal, parseMoney(originalAmount) || bal);
    const rate = Math.max(0, parseMoney(monthlyRate));
    const total = Math.max(1, Number(totalInstallments) || 1);
    const paid = Math.min(total - 1, Math.max(0, Number(paidInstallments) || 0));
    const rem = Math.max(1, total - paid);

    const manualPmt = parseMoney(monthlyPayment);
    const finalPmt =
      manualPmt > 0 ? manualPmt : calculateInstallmentValue(bal, rate, rem, system);

    onAddDebt({
      name: name.trim(),
      creditor: creditor.trim() || undefined,
      kind,
      amortizationSystem: system,
      originalAmount: orig,
      currentBalance: bal,
      monthlyInterestRate: rate,
      totalInstallments: total,
      paidInstallments: paid,
      monthlyPayment: finalPmt,
      dueDay: Math.min(31, Math.max(1, Number(dueDay) || 10)),
      accountId: accountId || accounts[0]?.id || 'principal',
    });

    setName('');
    setCreditor('');
    setCurrentBalance('');
    setOriginalAmount('');
    setMonthlyPayment('');
    setPaidInstallments('0');
    setShowNewModal(false);
  };

  return (
    <div className="space-y-4 pb-10 animate-view">
      {/* Cabeçalho + Alternador Lista / Simulador */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div>
          <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
            Empréstimos, Juros & Quitação
          </p>
          <h2 className="text-xl font-bold text-neutral-950 mt-0.5">
            Controle de Dívidas
          </h2>
        </div>

        <div className="flex bg-neutral-200/70 p-1 rounded-full text-xs font-semibold">
          <button
            onClick={() => setSubTab('list')}
            className={`px-3 py-1.5 rounded-full transition ${
              subTab === 'list' ? 'bg-neutral-950 text-white' : 'text-neutral-600'
            }`}
          >
            Contratos ({summary.activeCount})
          </button>
          <button
            onClick={() => setSubTab('simulator')}
            className={`px-3 py-1.5 rounded-full transition flex items-center gap-1 ${
              subTab === 'simulator' ? 'bg-neutral-950 text-white' : 'text-neutral-600'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" /> Quitação
          </button>
        </div>
      </div>

      {/* Card Principal de Endividamento */}
      <section className="editorial-card rounded-3xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Saldo devedor total (Principal)
            </p>
            <h3 className="text-3xl font-bold text-neutral-950 tabular-nums mt-1">
              {formatBRL(summary.totalBalance, hideBalances)}
            </h3>
          </div>

          <button
            onClick={() => setShowNewModal(true)}
            className="px-3.5 py-2 rounded-full bg-neutral-950 text-white text-xs font-semibold flex items-center gap-1 active:scale-95 transition flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Nova dívida
          </button>
        </div>

        {summary.activeCount > 0 && (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-neutral-500 tabular-nums">
                <span>Progresso de amortização</span>
                <span className="font-bold text-neutral-900">
                  {formatPct(summary.overallProgressPct, 0)} quitado
                </span>
              </div>
              <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                  style={{ width: `${summary.overallProgressPct}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-neutral-100 tabular-nums">
              <div>
                <span className="text-[10px] text-neutral-400 block">Parcelas / mês</span>
                <p className="text-xs font-bold text-neutral-950 mt-0.5">
                  {formatCompactBRL(summary.totalMonthlyPayment, hideBalances)}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-neutral-400 block">Juros futuros</span>
                <p className="text-xs font-bold text-amber-700 mt-0.5">
                  +{formatCompactBRL(summary.totalRemainingInterest, hideBalances)}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-neutral-400 block">Taxa média</span>
                <p className="text-xs font-bold text-neutral-900 mt-0.5">
                  {formatPct(summary.avgMonthlyRate, 2)} a.m.
                </p>
              </div>
            </div>
          </>
        )}
      </section>

      {subTab === 'list' ? (
        /* ==================== LISTA DE EMPRÉSTIMOS E DÍVIDAS ==================== */
        <div className="space-y-4">
          {debts.length === 0 ? (
            <section className="editorial-card rounded-3xl p-7 text-center space-y-3">
              <div className="w-11 h-11 rounded-2xl bg-[#F6F5F2] text-neutral-900 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-neutral-950">
                  Nenhuma dívida ou empréstimo registrado
                </h3>
                <p className="text-xs text-neutral-500 max-w-xs mx-auto leading-relaxed">
                  Cadastre financiamentos, empréstimos ou parcelamentos para acompanhar juros, amortizar parcelas e simular estratégias de quitação antecipada.
                </p>
              </div>
              <button
                onClick={() => setShowNewModal(true)}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold active:scale-95 transition"
              >
                <Plus className="w-3.5 h-3.5" /> Cadastrar empréstimo ou dívida
              </button>
            </section>
          ) : (
            <>
              {/* Atalho rápido para o Simulador se houver dívidas */}
              <button
                onClick={() => setSubTab('simulator')}
                className="w-full editorial-card rounded-2xl p-3.5 flex items-center justify-between text-left border-l-4 border-l-neutral-950 active:scale-[0.99] transition"
              >
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-4 h-4 text-neutral-900 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-neutral-950">
                      Simular Estratégia Avalanche vs. Bola de Neve
                    </p>
                    <p className="text-[11px] text-neutral-500">
                      Veja quanto você economiza em juros antecipando parcelas →
                    </p>
                  </div>
                </div>
              </button>

              {debts.map((debt) => {
                const metrics = computeDebtMetrics(debt);
                const isPaidOff = debt.currentBalance <= 0.01 || metrics.remainingInstallments <= 0;
                const isHighInterest = debt.monthlyInterestRate >= 3.0;
                const isAmortizing = amortizingId === debt.id;

                // Prévia de economia ao amortizar valor extra neste contrato
                const previewExtra = parseMoney(amortizeAmount);
                let previewInterestSaved = 0;
                if (isAmortizing && previewExtra > 0 && !isPaidOff) {
                  const newBal = Math.max(0, debt.currentBalance - previewExtra);
                  const r = debt.monthlyInterestRate / 100;
                  if (r > 0) {
                    if (amortizeMode === 'reduce_term') {
                      let b = newBal;
                      let months = 0;
                      let newTotalInt = 0;
                      while (b > 0.01 && months < metrics.remainingInstallments) {
                        months++;
                        const intM = b * r;
                        newTotalInt += intM;
                        const pmt = Math.min(b + intM, debt.monthlyPayment);
                        b = Math.max(0, b + intM - pmt);
                      }
                      previewInterestSaved = Math.max(
                        0,
                        round2(metrics.totalRemainingInterest - newTotalInt)
                      );
                    } else {
                      const newPmt = calculateInstallmentValue(
                        newBal,
                        debt.monthlyInterestRate,
                        metrics.remainingInstallments,
                        debt.amortizationSystem
                      );
                      const newTotalInt = Math.max(
                        0,
                        newPmt * metrics.remainingInstallments - newBal
                      );
                      previewInterestSaved = Math.max(
                        0,
                        round2(metrics.totalRemainingInterest - newTotalInt)
                      );
                    }
                  }
                }

                return (
                  <div
                    key={debt.id}
                    className="editorial-card rounded-3xl p-5 space-y-4"
                  >
                    {/* Topo do Card */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="text-base font-bold text-neutral-950 truncate">
                            {debt.name}
                          </h3>
                          {isPaidOff ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              Quitada
                            </span>
                          ) : (
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
                                isHighInterest
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-[#F6F5F2] text-neutral-700'
                              }`}
                            >
                              {formatPct(debt.monthlyInterestRate, 2)} a.m. (
                              {formatPct(metrics.annualInterestPct, 1)} a.a.)
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-neutral-400 mt-0.5">
                          {DEBT_KIND_LABEL[debt.kind]}
                          {debt.creditor ? ` · ${debt.creditor}` : ''} ·{' '}
                          {AMORTIZATION_LABEL[debt.amortizationSystem]}
                        </p>
                      </div>

                      <button
                        onClick={() => onDeleteDebt(debt.id)}
                        className="p-1 text-neutral-300 hover:text-red-600 flex-shrink-0"
                        title="Remover dívida"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Saldo Devedor e Progresso de Parcelas */}
                    <div className="space-y-1.5">
                      <div className="flex items-baseline justify-between tabular-nums">
                        <div>
                          <span className="text-[10px] uppercase tracking-wider text-neutral-400 block">
                            Saldo devedor atual
                          </span>
                          <span className="text-xl font-bold text-neutral-950">
                            {formatBRL(debt.currentBalance, hideBalances)}
                          </span>
                          <span className="text-xs text-neutral-400 ml-1.5">
                            de {formatBRL(debt.originalAmount, hideBalances)}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-bold text-neutral-900 block">
                            {debt.paidInstallments}/{debt.totalInstallments} parcelas
                          </span>
                          <span className="text-[10px] text-neutral-400">
                            {metrics.remainingInstallments > 0
                              ? `Faltam ${metrics.remainingInstallments}x · Dia ${debt.dueDay}`
                              : 'Contrato encerrado'}
                          </span>
                        </div>
                      </div>

                      <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-neutral-950 rounded-full transition-all duration-500"
                          style={{ width: `${metrics.progressPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Raio-X da Parcela: Amortização Real vs. Juros */}
                    {!isPaidOff && (
                      <div className="grid grid-cols-2 gap-2.5 p-3.5 rounded-2xl bg-[#F6F5F2] text-xs tabular-nums">
                        <div>
                          <span className="text-[10px] text-neutral-500 block">
                            Parcela atual (Dia {debt.dueDay})
                          </span>
                          <strong className="text-sm font-bold text-neutral-950 mt-0.5 block">
                            {formatBRL(debt.monthlyPayment, hideBalances)}
                          </strong>
                          <span className="text-[10px] text-emerald-700 font-medium block mt-0.5">
                            Abate {formatBRL(metrics.nextMonthPrincipal, hideBalances)} da dívida
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] text-neutral-500 block">
                            Custo de juros no mês
                          </span>
                          <strong className="text-sm font-bold text-amber-700 mt-0.5 block">
                            {formatBRL(metrics.nextMonthInterest, hideBalances)}/mês
                          </strong>
                          <span className="text-[10px] text-neutral-400 block mt-0.5">
                            Juros até o fim: {formatCompactBRL(metrics.totalRemainingInterest, hideBalances)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Painel Inline de Amortização Extra */}
                    {isAmortizing && !isPaidOff && (
                      <div className="p-3.5 rounded-2xl bg-neutral-950 text-white space-y-3 animate-view">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">
                            Amortização extraordinária
                          </span>
                          <button
                            onClick={() => setAmortizingId(null)}
                            className="text-[11px] text-neutral-400"
                          >
                            Cancelar
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 bg-white/10 p-1 rounded-xl text-[11px] font-semibold">
                          <button
                            type="button"
                            onClick={() => setAmortizeMode('reduce_term')}
                            className={`py-1.5 rounded-lg transition ${
                              amortizeMode === 'reduce_term'
                                ? 'bg-white text-neutral-950'
                                : 'text-neutral-300'
                            }`}
                          >
                            Reduzir prazo
                          </button>
                          <button
                            type="button"
                            onClick={() => setAmortizeMode('reduce_payment')}
                            className={`py-1.5 rounded-lg transition ${
                              amortizeMode === 'reduce_payment'
                                ? 'bg-white text-neutral-950'
                                : 'text-neutral-300'
                            }`}
                          >
                            Reduzir parcela
                          </button>
                        </div>

                        <div className="flex gap-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            autoFocus
                            value={amortizeAmount}
                            onChange={(e) => setAmortizeAmount(e.target.value)}
                            placeholder="Valor do abatimento (R$)"
                            className="flex-1 px-3 py-2 rounded-xl bg-white/10 text-white placeholder:text-neutral-400 text-xs font-bold tabular-nums focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const val = parseMoney(amortizeAmount);
                              if (val > 0) {
                                onAmortizeDebt(debt.id, val, amortizeMode);
                                setAmortizingId(null);
                                setAmortizeAmount('');
                              }
                            }}
                            className="px-4 py-2 rounded-xl bg-emerald-500 text-neutral-950 text-xs font-bold"
                          >
                            Confirmar
                          </button>
                        </div>

                        {previewInterestSaved > 0 && (
                          <p className="text-[11px] text-emerald-400 font-medium tabular-nums">
                            Economia imediata estimada:{' '}
                            <strong>{formatBRL(previewInterestSaved, hideBalances)}</strong> em juros futuros!
                          </p>
                        )}
                      </div>
                    )}

                    {/* Botões de Ação Mobile */}
                    {!isPaidOff && !isAmortizing && (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => onPayInstallment(debt)}
                          className="py-2.5 px-3 rounded-xl bg-neutral-950 text-white text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Pagar parcela {debt.paidInstallments + 1}
                        </button>
                        <button
                          onClick={() => {
                            setAmortizeAmount('');
                            setAmortizingId(debt.id);
                          }}
                          className="py-2.5 px-3 rounded-xl bg-[#F6F5F2] hover:bg-neutral-200/70 text-neutral-900 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition"
                        >
                          <ArrowDownRight className="w-3.5 h-3.5" />
                          Amortizar extra
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      ) : (
        /* ==================== SIMULADOR DE ESTRATÉGIAS DE QUITAÇÃO ==================== */
        <div className="space-y-4">
          {summary.activeCount === 0 ? (
            <section className="editorial-card rounded-3xl p-6 text-center space-y-3">
              <p className="text-sm font-bold text-neutral-900">
                Cadastre pelo menos 1 dívida para simular estratégias
              </p>
              <p className="text-xs text-neutral-500">
                O simulador compara os métodos Avalanche (foco nos maiores juros) e Bola de Neve (foco no menor saldo) para mostrar quanto tempo e dinheiro você economiza.
              </p>
              <button
                onClick={() => setShowNewModal(true)}
                className="px-4 py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold"
              >
                + Cadastrar dívida
              </button>
            </section>
          ) : (
            <>
              {/* Configuração de Aporte Extra Mensal */}
              <section className="editorial-card rounded-3xl p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-neutral-950">
                    1. Quanto você pode pagar a mais por mês?
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Além das parcelas obrigatórias ({formatBRL(summary.totalMonthlyPayment, hideBalances)}/mês), defina um valor extra para acelerar a quitação:
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-400">
                      + R$
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={extraMonthlyInput}
                      onChange={(e) => setExtraMonthlyInput(e.target.value)}
                      className="w-full pl-11 pr-4 py-2.5 rounded-2xl bg-[#F6F5F2] text-sm font-bold text-neutral-950 tabular-nums focus:outline-none"
                    />
                  </div>
                </div>

                {/* Pílulas de valores rápidos */}
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                  {['100', '250', '500', '1000', '2000'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setExtraMonthlyInput(preset)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold tabular-nums flex-shrink-0 transition ${
                        extraMonthlyInput === preset
                          ? 'bg-neutral-950 text-white'
                          : 'bg-[#F6F5F2] text-neutral-700'
                      }`}
                    >
                      + R$ {preset}
                    </button>
                  ))}
                </div>
              </section>

              {/* Escolha da Estratégia: Avalanche vs. Bola de Neve */}
              <section className="editorial-card rounded-3xl p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-neutral-950">
                    2. Escolha a estratégia de quitação
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Quando uma dívida é eliminada, o valor da parcela dela se soma ao seu aporte extra para atacar a próxima:
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSelectedStrategy('avalanche')}
                    className={`p-3.5 rounded-2xl text-left border transition space-y-1 ${
                      selectedStrategy === 'avalanche'
                        ? 'bg-neutral-950 text-white border-neutral-950'
                        : 'bg-[#F6F5F2] text-neutral-900 border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold flex items-center gap-1">
                        <Flame className="w-3.5 h-3.5 text-amber-400" /> Avalanche
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                        Mais econômico
                      </span>
                    </div>
                    <p
                      className={`text-[11px] leading-snug ${
                        selectedStrategy === 'avalanche' ? 'text-neutral-300' : 'text-neutral-500'
                      }`}
                    >
                      Ataca primeiro a dívida com <strong>maior taxa de juros</strong>.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedStrategy('snowball')}
                    className={`p-3.5 rounded-2xl text-left border transition space-y-1 ${
                      selectedStrategy === 'snowball'
                        ? 'bg-neutral-950 text-white border-neutral-950'
                        : 'bg-[#F6F5F2] text-neutral-900 border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5 text-amber-500" /> Bola de Neve
                      </span>
                    </div>
                    <p
                      className={`text-[11px] leading-snug ${
                        selectedStrategy === 'snowball' ? 'text-neutral-300' : 'text-neutral-500'
                      }`}
                    >
                      Ataca primeiro a dívida com <strong>menor saldo</strong> para eliminar boletos rápido.
                    </p>
                  </button>
                </div>

                {/* Resultado Comparativo */}
                <div className="p-4 rounded-2xl bg-[#F6F5F2] space-y-3 tabular-nums">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block">
                        Economia total de juros
                      </span>
                      <strong className="text-2xl font-bold text-emerald-700">
                        {formatBRL(simulations.activeSim.interestSavedVsBaseline, hideBalances)}
                      </strong>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block">
                        Prazo economizado
                      </span>
                      <strong className="text-lg font-bold text-neutral-950">
                        {simulations.activeSim.monthsSavedVsBaseline} meses a menos
                      </strong>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-neutral-200/70 text-xs">
                    <div>
                      <span className="text-[10px] text-neutral-400 block">
                        Sem aporte extra (Atual)
                      </span>
                      <p className="font-bold text-neutral-700 mt-0.5">
                        {simulations.baseline.totalMonths} meses
                      </p>
                      <p className="text-[11px] text-neutral-400">
                        Juros: {formatCompactBRL(simulations.baseline.totalInterestPaid, hideBalances)}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-400 block">
                        Com {selectedStrategy === 'avalanche' ? 'Avalanche' : 'Bola de Neve'}
                      </span>
                      <p className="font-bold text-emerald-700 mt-0.5">
                        {simulations.activeSim.totalMonths} meses
                      </p>
                      <p className="text-[11px] text-neutral-500">
                        Juros: {formatCompactBRL(simulations.activeSim.totalInterestPaid, hideBalances)}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Ordem Recomendada de Ataque */}
              <section className="editorial-card rounded-3xl p-5 space-y-3.5">
                <div>
                  <h3 className="text-sm font-bold text-neutral-950">
                    3. Ordem de ataque recomendada
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Siga esta sequência concentrando o valor extra no 1º contrato da fila enquanto paga a parcela mínima dos demais:
                  </p>
                </div>

                <div className="divide-y divide-neutral-100 tabular-nums">
                  {simulations.activeSim.order.map((item, idx) => (
                    <div
                      key={item.id}
                      className="py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 ${
                            idx === 0
                              ? 'bg-neutral-950 text-white'
                              : 'bg-[#F6F5F2] text-neutral-700'
                          }`}
                        >
                          {idx + 1}º
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-bold text-neutral-950 truncate">
                              {item.name}
                            </p>
                            {idx === 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                                Foco atual
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-neutral-400">
                            Saldo: {formatBRL(item.currentBalance, hideBalances)} · Taxa:{' '}
                            {formatPct(item.monthlyInterestRate, 2)} a.m.
                          </p>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-bold text-emerald-700">
                          Quitada no mês {item.paidOffMonth}
                        </p>
                        <p className="text-[10px] text-neutral-400">
                          Juros: {formatCompactBRL(item.interestPaid, hideBalances)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      )}

      {/* ==================== MODAL CADASTRAR EMPRÉSTIMO / DÍVIDA ==================== */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form
            onSubmit={handleCreateDebt}
            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 space-y-3.5 shadow-2xl max-h-[92dvh] overflow-y-auto animate-view"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-neutral-950">
                Registrar empréstimo ou dívida
              </h3>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="text-xs text-neutral-400 py-1 px-2"
              >
                Fechar
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="col-span-2 sm:col-span-1">
                <label className="text-[11px] text-neutral-500 block mb-1">
                  Nome da dívida / contrato
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Financiamento Carro, Empréstimo..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="text-[11px] text-neutral-500 block mb-1">
                  Banco / Credor (opcional)
                </label>
                <input
                  type="text"
                  value={creditor}
                  onChange={(e) => setCreditor(e.target.value)}
                  placeholder="Ex: Itaú, Nubank, Caixa..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] text-neutral-500 block mb-1">Modalidade</label>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as DebtKind)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900"
                >
                  <option value="loan">Empréstimo Pessoal</option>
                  <option value="financing">Financiamento</option>
                  <option value="credit_card">Cartão Parcelado / Rotativo</option>
                  <option value="consigned">Consignado</option>
                  <option value="overdraft">Cheque Especial</option>
                  <option value="other">Outra Dívida</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-neutral-500 block mb-1">
                  Sistema de juros
                </label>
                <select
                  value={system}
                  onChange={(e) => setSystem(e.target.value as AmortizationSystem)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900"
                >
                  <option value="price">Tabela Price (Parcela Fixa)</option>
                  <option value="sac">SAC (Decrescente)</option>
                  <option value="fixed">Parcelado Simples</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] text-neutral-500 block mb-1">
                  Saldo devedor hoje (R$)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={currentBalance}
                  onChange={(e) => setCurrentBalance(e.target.value)}
                  placeholder="10000,00"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F6F5F2] text-xs font-bold text-neutral-950 tabular-nums"
                />
              </div>
              <div>
                <label className="text-[11px] text-neutral-500 block mb-1">
                  Valor original contratado (R$)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={originalAmount}
                  onChange={(e) => setOriginalAmount(e.target.value)}
                  placeholder="Opcional (igual ao atual)"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900 tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] text-neutral-500 block mb-1">
                  Juros (% a.m.)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={monthlyRate}
                  onChange={(e) => setMonthlyRate(e.target.value)}
                  placeholder="1,99"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F6F5F2] text-xs font-bold text-neutral-950 tabular-nums"
                />
              </div>
              <div>
                <label className="text-[11px] text-neutral-500 block mb-1">
                  Total parcelas
                </label>
                <input
                  type="number"
                  min={1}
                  max={420}
                  value={totalInstallments}
                  onChange={(e) => setTotalInstallments(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900 tabular-nums"
                />
              </div>
              <div>
                <label className="text-[11px] text-neutral-500 block mb-1">
                  Já pagas
                </label>
                <input
                  type="number"
                  min={0}
                  max={419}
                  value={paidInstallments}
                  onChange={(e) => setPaidInstallments(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900 tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] text-neutral-500 block mb-1">
                  Valor da parcela (R$)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={monthlyPayment}
                  onChange={(e) => setMonthlyPayment(e.target.value)}
                  placeholder={
                    suggestedInstallment > 0
                      ? `Auto: ${suggestedInstallment.toFixed(2).replace('.', ',')}`
                      : 'Calculado auto'
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F6F5F2] text-xs font-bold text-neutral-950 tabular-nums"
                />
              </div>
              <div>
                <label className="text-[11px] text-neutral-500 block mb-1">
                  Dia do vencimento
                </label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={dueDay}
                  onChange={(e) => setDueDay(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900 tabular-nums"
                />
              </div>
            </div>

            {suggestedInstallment > 0 && !monthlyPayment && (
              <p className="text-[11px] text-neutral-500 bg-[#F6F5F2] px-3 py-2 rounded-xl tabular-nums">
                Parcela estimada pela taxa:{' '}
                <strong className="text-neutral-900">{formatBRL(suggestedInstallment)}/mês</strong>{' '}
                (Juros equivalentes a{' '}
                <strong>
                  {formatPct(monthlyToAnnualInterestPct(parseMoney(monthlyRate)), 1)} a.a.
                </strong>
                )
              </p>
            )}

            <button
              type="submit"
              className="w-full py-3 rounded-full bg-neutral-950 text-white font-semibold text-xs active:scale-98 transition"
            >
              Salvar dívida
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
