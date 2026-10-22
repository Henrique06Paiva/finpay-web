import React, { useMemo, useState } from 'react';
import {
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { BenchmarkType, MarketIndicators, StrategicGoal } from '../types/finance';
import { BENCHMARK_INFO, GOAL_TEMPLATES } from '../data/defaults';
import { annualToMonthlyRate, getAnnualBenchmarkRate } from '../services/marketService';
import { addMonths, currentYM, todayISO } from '../utils/date';
import { formatBRL, formatPct, monthsBetween, parseMoney } from '../utils/format';
import { CategoryIcon } from './CategoryIcon';

interface GoalsAndMarketTabProps {
  goals: StrategicGoal[];
  market: MarketIndicators;
  isLoadingMarket: boolean;
  hideBalances: boolean;
  onAddGoal: (goal: Omit<StrategicGoal, 'id'>) => void;
  onContributeGoal: (goalId: string, amount: number) => void;
  onDeleteGoal: (goalId: string) => void;
  onRefreshMarket: () => void;
}

export const GoalsAndMarketTab: React.FC<GoalsAndMarketTabProps> = ({
  goals,
  market,
  isLoadingMarket,
  hideBalances,
  onAddGoal,
  onContributeGoal,
  onDeleteGoal,
  onRefreshMarket,
}) => {
  const [subView, setSubView] = useState<'goals' | 'market'>('goals');
  const [showNewModal, setShowNewModal] = useState(false);
  const [contributingId, setContributingId] = useState<string | null>(null);
  const [contributeAmount, setContributeAmount] = useState('');

  // Campos Nova Meta
  const [title, setTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('0');
  const [targetDate, setTargetDate] = useState(addMonths(todayISO(), 12).slice(0, 7));
  const [benchmark, setBenchmark] = useState<BenchmarkType>('TESOURO_SELIC');

  // Simulador Rápido
  const [simAmount, setSimAmount] = useState('10000');

  const nowYm = currentYM();
  const totalSaved = goals.reduce((acc, g) => acc + g.currentAmount, 0);

  const handleCreateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseMoney(targetAmount);
    const current = parseMoney(currentAmount);
    if (!title.trim() || target <= 0) return;

    const months = monthsBetween(nowYm, targetDate);
    const info = BENCHMARK_INFO[benchmark];

    onAddGoal({
      title: title.trim(),
      subtitle: `Meta para ${targetDate.split('-').reverse().join('/')}`,
      icon: 'Target',
      color: '#111111',
      targetAmount: target,
      currentAmount: current,
      monthlyContribution: Math.max(50, Math.round((target - current) / Math.max(1, months))),
      targetDate,
      benchmark,
      priority: 'Alta',
      recommendedAsset: info.asset,
    });

    setTitle('');
    setTargetAmount('');
    setCurrentAmount('0');
    setShowNewModal(false);
  };

  const simComparison = useMemo(() => {
    const val = Math.max(0, parseMoney(simAmount) || 0);
    const calc = (bench: BenchmarkType, name: string, subtitle: string) => {
      const info = getAnnualBenchmarkRate(bench, market);
      const mRate = annualToMonthlyRate(info.netAnnual);
      return {
        name,
        subtitle,
        netAnnual: info.netAnnual,
        inOneMonth: val * mRate,
        inOneYear: val * (info.netAnnual / 100),
      };
    };

    return [
      calc('TESOURO_SELIC', 'Tesouro Selic / CDB 100% CDI', 'Liquidez diária · Resgate imediato'),
      calc('110_CDI', 'LCI/LCA Isenta ou CDB 110% CDI', 'Ideal para metas de 1 a 3 anos'),
      calc('POUPANCA', 'Poupança tradicional', 'Rendimento inferior à Selic'),
    ];
  }, [simAmount, market]);

  return (
    <div className="space-y-5 pb-10 animate-view">
      {/* Cabeçalho + Seletor Metas / Mercado */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
            {subView === 'goals' ? 'Reservas & Objetivos' : 'Boletim Diário BCB'}
          </p>
          <h2 className="text-2xl font-bold text-neutral-950 mt-0.5">
            {subView === 'goals' ? 'Metas Financeiras' : 'Mercado & Alocação'}
          </h2>
        </div>

        <div className="flex bg-neutral-200/70 p-1 rounded-full text-xs font-semibold">
          <button
            onClick={() => setSubView('goals')}
            className={`px-3 py-1 rounded-full transition ${
              subView === 'goals' ? 'bg-neutral-950 text-white' : 'text-neutral-600'
            }`}
          >
            Metas ({goals.length})
          </button>
          <button
            onClick={() => setSubView('market')}
            className={`px-3 py-1 rounded-full transition ${
              subView === 'market' ? 'bg-neutral-950 text-white' : 'text-neutral-600'
            }`}
          >
            Mercado
          </button>
        </div>
      </div>

      {subView === 'goals' ? (
        /* ==================== MÓDULO 5: METAS FINANCEIRAS ==================== */
        <div className="space-y-5">
          <section className="editorial-card rounded-3xl p-5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                Total acumulado em metas
              </p>
              <h3 className="text-3xl font-bold text-neutral-950 tabular-nums mt-1">
                {formatBRL(totalSaved, hideBalances)}
              </h3>
            </div>
            <button
              onClick={() => setShowNewModal(true)}
              className="px-4 py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition"
            >
              <Plus className="w-3.5 h-3.5" /> Nova meta
            </button>
          </section>

          {/* Modelos prontos: Reserva de emergência, Viagem, Computador, Carro, Casamento */}
          {goals.length === 0 && (
            <section className="editorial-card rounded-3xl p-5 space-y-3.5">
              <div>
                <h3 className="text-sm font-bold text-neutral-950">
                  Escolha uma meta para começar
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Toque em qualquer objetivo abaixo ou crie uma meta personalizada:
                </p>
              </div>

              <div className="divide-y divide-neutral-100">
                {GOAL_TEMPLATES.map((tpl) => {
                  const targetDateYm = addMonths(todayISO(), tpl.months).slice(0, 7);
                  return (
                    <div
                      key={tpl.key}
                      className="py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-9 h-9 rounded-2xl bg-[#F6F5F2] flex items-center justify-center text-neutral-900 flex-shrink-0">
                          <CategoryIcon name={tpl.icon} className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-neutral-900 truncate">
                            {tpl.title}
                          </p>
                          <p className="text-xs text-neutral-400 truncate">{tpl.subtitle}</p>
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          onAddGoal({
                            title: tpl.title,
                            subtitle: tpl.subtitle,
                            icon: tpl.icon,
                            color: '#111111',
                            targetAmount: tpl.targetAmount,
                            currentAmount: 0,
                            monthlyContribution: Math.round(tpl.targetAmount / tpl.months),
                            targetDate: targetDateYm,
                            benchmark: tpl.benchmark,
                            priority: tpl.priority,
                            recommendedAsset: BENCHMARK_INFO[tpl.benchmark].asset,
                          })
                        }
                        className="px-3 py-1.5 rounded-full bg-[#F6F5F2] hover:bg-neutral-200 text-xs font-semibold text-neutral-900 flex-shrink-0"
                      >
                        + Usar
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Lista de Metas */}
          <div className="space-y-4">
            {goals.map((goal) => {
              const pct = Math.min(
                100,
                (goal.currentAmount / Math.max(1, goal.targetAmount)) * 100
              );
              const monthsLeft = monthsBetween(nowYm, goal.targetDate);
              const rateInfo = getAnnualBenchmarkRate(goal.benchmark, market);
              const mRate = annualToMonthlyRate(rateInfo.netAnnual);

              // Quanto economizar por mês (sem juros vs com ajuda dos juros compostos)
              const remainingGap = Math.max(0, goal.targetAmount - goal.currentAmount);
              const simpleMonthlySave = remainingGap / Math.max(1, monthsLeft);

              const compound = Math.pow(1 + mRate, monthsLeft);
              const futureOfCurrent = goal.currentAmount * compound;
              const annuity = mRate > 0 ? (compound - 1) / mRate : monthsLeft;
              const smartMonthlySave = Math.max(
                0,
                (goal.targetAmount - futureOfCurrent) / annuity
              );
              const monthlyPassiveYield = goal.currentAmount * mRate;

              return (
                <div key={goal.id} className="editorial-card rounded-3xl p-5 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="w-10 h-10 rounded-2xl bg-[#F6F5F2] flex items-center justify-center text-neutral-900">
                        <CategoryIcon name={goal.icon} className="w-5 h-5" />
                      </span>
                      <div>
                        <h3 className="text-base font-bold text-neutral-950">{goal.title}</h3>
                        <p className="text-xs text-neutral-400">
                          Prazo: {goal.targetDate.split('-').reverse().join('/')} · {monthsLeft} meses
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => onDeleteGoal(goal.id)}
                      className="text-neutral-300 hover:text-red-600 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Progresso */}
                  <div>
                    <div className="flex justify-between items-baseline mb-1.5 tabular-nums">
                      <span className="text-lg font-bold text-neutral-950">
                        {formatBRL(goal.currentAmount, hideBalances)}{' '}
                        <span className="text-xs font-normal text-neutral-400">
                          de {formatBRL(goal.targetAmount, hideBalances)}
                        </span>
                      </span>
                      <span className="text-xs font-bold text-neutral-900">
                        {formatPct(pct, 0)} concluído
                      </span>
                    </div>
                    <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-neutral-950 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Quanto economizar por mês */}
                  <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-[#F6F5F2] text-xs tabular-nums">
                    <div>
                      <span className="text-[11px] text-neutral-500 block">
                        Economizar por mês (c/ juros)
                      </span>
                      <strong className="text-sm font-bold text-neutral-950 mt-0.5 block">
                        {formatBRL(smartMonthlySave, hideBalances)}/mês
                      </strong>
                      <span className="text-[10px] text-neutral-400">
                        Sem investir: {formatBRL(simpleMonthlySave, hideBalances)}/mês
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-neutral-500 block">
                        Rendimento atual do saldo
                      </span>
                      <strong className="text-sm font-bold text-emerald-700 mt-0.5 block">
                        +{formatBRL(monthlyPassiveYield, hideBalances)}/mês
                      </strong>
                      <span className="text-[10px] text-neutral-400">
                        Taxa líq: {formatPct(rateInfo.netAnnual, 1)} a.a.
                      </span>
                    </div>
                  </div>

                  {/* Recomendação de onde alocar */}
                  <p className="text-xs text-neutral-600 leading-relaxed border-t border-neutral-100 pt-3">
                    <strong className="font-semibold text-neutral-900">Onde guardar: </strong>
                    {goal.recommendedAsset}
                  </p>

                  {/* Registrar aporte */}
                  {contributingId === goal.id ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        autoFocus
                        value={contributeAmount}
                        onChange={(e) => setContributeAmount(e.target.value)}
                        placeholder="Valor do aporte (R$)"
                        className="flex-1 px-3.5 py-2 rounded-xl bg-[#F6F5F2] text-xs font-semibold text-neutral-900 tabular-nums"
                      />
                      <button
                        onClick={() => {
                          const val = parseMoney(contributeAmount);
                          if (val > 0) {
                            onContributeGoal(goal.id, val);
                            setContributingId(null);
                            setContributeAmount('');
                          }
                        }}
                        className="px-4 py-2 rounded-xl bg-neutral-950 text-white text-xs font-semibold"
                      >
                        Somar
                      </button>
                      <button
                        onClick={() => setContributingId(null)}
                        className="px-3 py-2 rounded-xl bg-neutral-100 text-neutral-500 text-xs"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setContributeAmount('');
                        setContributingId(goal.id);
                      }}
                      className="w-full py-2.5 rounded-xl bg-[#F6F5F2] hover:bg-neutral-200/70 text-xs font-semibold text-neutral-900 transition"
                    >
                      + Registrar aporte nesta meta
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ==================== INDICADORES DIÁRIOS & RECOMENDAÇÕES ==================== */
        <div className="space-y-5">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">
                Atualizado às {market.updatedAt}
              </span>
              <button
                onClick={onRefreshMarket}
                disabled={isLoadingMarket}
                className="px-3 py-1.5 rounded-full bg-white border border-neutral-200 text-xs font-medium text-neutral-700 flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingMarket ? 'animate-spin' : ''}`} />
                Atualizar taxas
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 tabular-nums">
              <div className="editorial-card rounded-2xl p-4">
                <span className="text-xs text-neutral-400 block">Taxa Selic</span>
                <strong className="text-2xl font-bold text-neutral-950 mt-1 block">
                  {formatPct(market.selic, 2)}
                </strong>
                <span className="text-[11px] text-neutral-400">ao ano</span>
              </div>

              <div className="editorial-card rounded-2xl p-4">
                <span className="text-xs text-neutral-400 block">CDI</span>
                <strong className="text-2xl font-bold text-neutral-950 mt-1 block">
                  {formatPct(market.cdi, 2)}
                </strong>
                <span className="text-[11px] text-neutral-400">
                  {formatPct(annualToMonthlyRate(market.cdi) * 100, 2)} ao mês
                </span>
              </div>

              <div className="editorial-card rounded-2xl p-4">
                <span className="text-xs text-neutral-400 block">IPCA (Inflação 12m)</span>
                <strong className="text-xl font-bold text-neutral-950 mt-1 block">
                  {formatPct(market.ipca, 2)}
                </strong>
                <span className="text-[11px] text-neutral-400">referência oficial</span>
              </div>

              <div className="editorial-card rounded-2xl p-4">
                <span className="text-xs text-neutral-400 block">Dólar Comercial</span>
                <strong className="text-xl font-bold text-neutral-950 mt-1 block">
                  R$ {market.usdBid.toFixed(2).replace('.', ',')}
                </strong>
                <span
                  className={`text-[11px] font-medium ${
                    market.usdChange >= 0 ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {formatPct(market.usdChange, 2, true)} no dia
                </span>
              </div>
            </div>
          </section>

          {/* Simulador de Rendimento */}
          <section className="editorial-card rounded-3xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-neutral-950">Simulador de rendimento líquido</h3>
              <p className="text-xs text-neutral-500">
                Compare quanto qualquer valor rende hoje (já descontando Imposto de Renda):
              </p>
            </div>

            <div>
              <label className="text-[11px] text-neutral-400 block mb-1">Valor aplicado (R$)</label>
              <input
                type="text"
                inputMode="decimal"
                value={simAmount}
                onChange={(e) => setSimAmount(e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl bg-[#F6F5F2] text-sm font-bold text-neutral-950 tabular-nums"
              />
            </div>

            <div className="divide-y divide-neutral-100 tabular-nums">
              {simComparison.map((item) => (
                <div
                  key={item.name}
                  className="py-3 first:pt-1 last:pb-1 flex items-center justify-between"
                >
                  <div>
                    <p className="text-xs font-semibold text-neutral-900">{item.name}</p>
                    <p className="text-[11px] text-neutral-400">{item.subtitle}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-emerald-700">
                      +{formatBRL(item.inOneMonth, hideBalances)}/mês
                    </p>
                    <p className="text-[11px] text-neutral-400">
                      +{formatBRL(item.inOneYear, hideBalances)}/ano
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Modal Criar Meta */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-4">
          <form
            onSubmit={handleCreateGoal}
            className="w-full max-w-md rounded-3xl bg-white p-6 space-y-4 shadow-2xl animate-view"
          >
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-neutral-950">Criar nova meta</h3>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="text-xs text-neutral-400"
              >
                Fechar
              </button>
            </div>

            <div>
              <label className="text-xs text-neutral-500 block mb-1">Objetivo</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Reserva de emergência, Viagem, Carro..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Valor da meta (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  placeholder="15000"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F6F5F2] text-xs font-bold text-neutral-950 tabular-nums"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Já guardado (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={currentAmount}
                  onChange={(e) => setCurrentAmount(e.target.value)}
                  placeholder="0"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900 tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Prazo (Mês/Ano)</label>
                <input
                  type="month"
                  required
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Onde vai render</label>
                <select
                  value={benchmark}
                  onChange={(e) => setBenchmark(e.target.value as BenchmarkType)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900"
                >
                  <option value="TESOURO_SELIC">Tesouro Selic / 100% CDI</option>
                  <option value="110_CDI">LCI Isenta / 110% CDI</option>
                  <option value="IPCA_PLUS_6">Tesouro IPCA+</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-full bg-neutral-950 text-white font-semibold text-xs"
            >
              Salvar meta
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
