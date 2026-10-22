import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  Account,
  Bill,
  Budget,
  Category,
  Frequency,
  PaymentMethod,
  Transaction,
} from '../types/finance';
import {
  computeBudgetStatuses,
  detectForgottenRecurringExpenses,
} from '../utils/analytics';
import {
  daysInMonth,
  diffDays,
  FREQ_LABEL,
  monthLabel,
  parseISO,
  relativeDue,
  shiftYM,
  todayISO,
  ymOf,
} from '../utils/date';
import { formatBRL, formatCompactBRL, formatPct, parseMoney, toInputMoney } from '../utils/format';
import { CategoryIcon } from './CategoryIcon';
import { PAYMENT_LABEL } from '../data/defaults';

interface PlanningTabProps {
  selectedYm: string;
  onChangeYm: (ym: string) => void;
  categories: Category[];
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
  bills: Bill[];
  monthlyOverallBudget: number;
  dismissedSuggestions: string[];
  hideBalances: boolean;
  onSaveBudget: (categoryId: string, limit: number) => void;
  onUpdateOverallBudget: (limit: number) => void;
  onAddBill: (bill: Omit<Bill, 'id' | 'createdAt'>) => void;
  onPayBill: (bill: Bill) => void;
  onDeleteBill: (billId: string) => void;
  onDismissSuggestion: (key: string) => void;
}

export const PlanningTab: React.FC<PlanningTabProps> = ({
  selectedYm,
  onChangeYm,
  categories,
  accounts,
  transactions,
  budgets,
  bills,
  monthlyOverallBudget,
  dismissedSuggestions,
  hideBalances,
  onSaveBudget,
  onUpdateOverallBudget,
  onAddBill,
  onPayBill,
  onDeleteBill,
  onDismissSuggestion,
}) => {
  const [subTab, setSubTab] = useState<'budgets' | 'bills'>('budgets');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [catLimitInput, setCatLimitInput] = useState('');
  const [editingOverall, setEditingOverall] = useState(false);
  const [overallInput, setOverallInput] = useState('');
  const [showAllCategories, setShowAllCategories] = useState(false);

  // Modal Nova Conta Fixa
  const [showBillModal, setShowBillModal] = useState(false);
  const [billName, setBillName] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billCategory, setBillCategory] = useState('moradia');
  const [billAccount, setBillAccount] = useState(accounts[0]?.id || 'principal');
  const [billMethod, setBillMethod] = useState<PaymentMethod>('pix');
  const [billFreq, setBillFreq] = useState<Frequency>('monthly');
  const [billDue, setBillDue] = useState(todayISO());
  const [billRemind, setBillRemind] = useState('3');

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.kind === 'expense'),
    [categories]
  );

  const budgetStatuses = useMemo(
    () => computeBudgetStatuses(selectedYm, budgets, transactions, categories),
    [selectedYm, budgets, transactions, categories]
  );

  const forgottenCandidates = useMemo(
    () => detectForgottenRecurringExpenses(transactions, bills, dismissedSuggestions),
    [transactions, bills, dismissedSuggestions]
  );

  // Totais reais vs planejados no mês
  const budgetSummary = useMemo(() => {
    const sumCategoryLimits = budgets.reduce((a, b) => a + b.limit, 0);
    const plannedTotal =
      monthlyOverallBudget > 0 ? monthlyOverallBudget : sumCategoryLimits;

    let actualSpent = 0;
    let prevMonthTotalSpent = 0;
    const prevYm = shiftYM(selectedYm, -1);

    for (const tx of transactions) {
      if (tx.type !== 'expense' || tx.status !== 'paid') continue;
      if (ymOf(tx.date) === selectedYm) actualSpent += tx.amount;
      else if (ymOf(tx.date) === prevYm) prevMonthTotalSpent += tx.amount;
    }

    const pct = plannedTotal > 0 ? (actualSpent / plannedTotal) * 100 : 0;
    const diffPrevPct =
      prevMonthTotalSpent > 0
        ? ((actualSpent - prevMonthTotalSpent) / prevMonthTotalSpent) * 100
        : null;

    return {
      plannedTotal,
      actualSpent,
      prevMonthTotalSpent,
      pct,
      diffPrevPct,
    };
  }, [budgets, monthlyOverallBudget, transactions, selectedYm]);

  // Calendário mensal de vencimentos
  const calendarDays = useMemo(() => {
    const dim = daysInMonth(selectedYm);
    const firstDate = parseISO(`${selectedYm}-01`);
    const startWeekday = firstDate.getDay(); // 0 = dom
    const dueDaysMap = new Map<number, Bill[]>();

    for (const b of bills) {
      if (!b.active) continue;
      if (ymOf(b.nextDue) === selectedYm) {
        const d = Number(b.nextDue.split('-')[2]);
        const arr = dueDaysMap.get(d) || [];
        arr.push(b);
        dueDaysMap.set(d, arr);
      }
    }

    return { dim, startWeekday, dueDaysMap };
  }, [selectedYm, bills]);

  const handleCreateBill = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseMoney(billAmount);
    if (!billName.trim() || val <= 0) return;
    const anchorDay = Number(billDue.split('-')[2]) || 10;

    onAddBill({
      name: billName.trim(),
      amount: val,
      categoryId: billCategory,
      accountId: billAccount,
      paymentMethod: billMethod,
      frequency: billFreq,
      nextDue: billDue,
      anchorDay,
      remindDaysBefore: Math.max(0, Number(billRemind) || 3),
      active: true,
    });

    setBillName('');
    setBillAmount('');
    setShowBillModal(false);
  };

  return (
    <div className="space-y-5 pb-10 animate-view">
      {/* Navegação Mês + Seletor Orçamentos / Contas Fixas */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1 bg-white border border-neutral-200/80 rounded-full px-2 py-1">
          <button
            onClick={() => onChangeYm(shiftYM(selectedYm, -1))}
            className="w-7 h-7 rounded-full flex items-center justify-center text-neutral-600"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-semibold text-neutral-900 px-1.5 min-w-[105px] text-center">
            {monthLabel(selectedYm)}
          </span>
          <button
            onClick={() => onChangeYm(shiftYM(selectedYm, 1))}
            className="w-7 h-7 rounded-full flex items-center justify-center text-neutral-600"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex bg-neutral-200/70 p-1 rounded-full text-xs font-semibold">
          <button
            onClick={() => setSubTab('budgets')}
            className={`px-3 py-1 rounded-full transition ${
              subTab === 'budgets' ? 'bg-neutral-950 text-white' : 'text-neutral-600'
            }`}
          >
            Orçamentos
          </button>
          <button
            onClick={() => setSubTab('bills')}
            className={`px-3 py-1 rounded-full transition ${
              subTab === 'bills' ? 'bg-neutral-950 text-white' : 'text-neutral-600'
            }`}
          >
            Fixas ({bills.length})
          </button>
        </div>
      </div>

      {subTab === 'budgets' ? (
        /* ==================== MÓDULO 3: ORÇAMENTOS MENSAIS ==================== */
        <div className="space-y-5">
          {/* Card Geral Real vs Planejado + Comparativo com Mês Anterior */}
          <section className="editorial-card rounded-3xl p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                  Gasto real vs. planejado
                </p>
                <div className="flex items-baseline gap-2 mt-1 tabular-nums">
                  <h2 className="text-3xl font-bold text-neutral-950">
                    {formatBRL(budgetSummary.actualSpent, hideBalances)}
                  </h2>
                  {budgetSummary.plannedTotal > 0 && (
                    <span className="text-xs text-neutral-400">
                      de {formatBRL(budgetSummary.plannedTotal, hideBalances)}
                    </span>
                  )}
                </div>
              </div>

              {!editingOverall ? (
                <button
                  onClick={() => {
                    setOverallInput(toInputMoney(budgetSummary.plannedTotal));
                    setEditingOverall(true);
                  }}
                  className="px-3 py-1.5 rounded-full bg-[#F6F5F2] text-xs font-semibold text-neutral-800"
                >
                  {budgetSummary.plannedTotal > 0 ? 'Ajustar teto' : 'Definir teto mensal'}
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={overallInput}
                    onChange={(e) => setOverallInput(e.target.value)}
                    placeholder="Ex: 4000"
                    className="w-24 px-2.5 py-1.5 rounded-xl bg-[#F6F5F2] text-xs font-semibold text-neutral-900 tabular-nums"
                  />
                  <button
                    onClick={() => {
                      onUpdateOverallBudget(parseMoney(overallInput));
                      setEditingOverall(false);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-neutral-950 text-white text-xs font-semibold"
                  >
                    OK
                  </button>
                </div>
              )}
            </div>

            {budgetSummary.plannedTotal > 0 && (
              <>
                <div className="w-full h-2.5 bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      budgetSummary.pct >= 100
                        ? 'bg-red-600'
                        : budgetSummary.pct >= 80
                        ? 'bg-amber-500'
                        : 'bg-neutral-900'
                    }`}
                    style={{ width: `${Math.min(100, budgetSummary.pct)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-500 tabular-nums">
                  <span>{formatPct(budgetSummary.pct, 0)} utilizado</span>
                  {budgetSummary.diffPrevPct !== null ? (
                    <span>
                      {budgetSummary.diffPrevPct > 0 ? '+' : ''}
                      {formatPct(budgetSummary.diffPrevPct, 0)} vs. mês passado (
                      {formatCompactBRL(budgetSummary.prevMonthTotalSpent, hideBalances)})
                    </span>
                  ) : (
                    <span>
                      Disponível:{' '}
                      {formatBRL(
                        Math.max(0, budgetSummary.plannedTotal - budgetSummary.actualSpent),
                        hideBalances
                      )}
                    </span>
                  )}
                </div>
              </>
            )}
          </section>

          {/* Limites por Categoria + Alertas 50%, 80% e 100% */}
          <section className="editorial-card rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-neutral-950">
                  Limites por categoria
                </h3>
                <p className="text-xs text-neutral-400">
                  Toque em qualquer categoria para definir ou ajustar o teto mensal
                </p>
              </div>
            </div>

            <div className="divide-y divide-neutral-100">
              {expenseCategories
                .filter((cat, idx) => {
                  if (showAllCategories || editingCatId === cat.id) return true;
                  const st = budgetStatuses.find((b) => b.category.id === cat.id);
                  if (st && (st.limit > 0 || st.spent > 0)) return true;
                  return idx < 5;
                })
                .map((cat) => {
                const status = budgetStatuses.find((b) => b.category.id === cat.id);
                const limit = status?.limit || 0;
                const spent = status?.spent || 0;
                const prevSpent = status?.prevMonthSpent || 0;
                const pct = limit > 0 ? (spent / limit) * 100 : 0;
                const alertLevel = status?.alertLevel || 'ok';
                const isEditing = editingCatId === cat.id;

                return (
                  <div key={cat.id} className="py-3.5 first:pt-1 last:pb-1 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-white flex-shrink-0"
                          style={{ backgroundColor: cat.color }}
                        >
                          <CategoryIcon name={cat.icon} className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-bold text-neutral-900 truncate">
                              {cat.name}
                            </p>
                            {alertLevel !== 'ok' && (
                              <span
                                className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                                  alertLevel === '100'
                                    ? 'bg-red-100 text-red-700'
                                    : alertLevel === '80'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-neutral-100 text-neutral-700'
                                }`}
                              >
                                {alertLevel === '100'
                                  ? '100% estourado'
                                  : alertLevel === '80'
                                  ? 'Alerta 80%'
                                  : '50% atingido'}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-neutral-400 tabular-nums">
                            Gasto: {formatBRL(spent, hideBalances)}
                            {prevSpent > 0 ? ` · Mês ant: ${formatCompactBRL(prevSpent, hideBalances)}` : ''}
                          </p>
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            inputMode="decimal"
                            autoFocus
                            value={catLimitInput}
                            onChange={(e) => setCatLimitInput(e.target.value)}
                            placeholder="Limite R$"
                            className="w-20 px-2 py-1 rounded-lg bg-[#F6F5F2] text-xs font-semibold text-neutral-900 tabular-nums"
                          />
                          <button
                            onClick={() => {
                              onSaveBudget(cat.id, parseMoney(catLimitInput));
                              setEditingCatId(null);
                            }}
                            className="p-1.5 rounded-lg bg-neutral-950 text-white"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingCatId(null)}
                            className="p-1.5 rounded-lg bg-neutral-100 text-neutral-500"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setCatLimitInput(toInputMoney(limit));
                            setEditingCatId(cat.id);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-[#F6F5F2] hover:bg-neutral-200/70 text-[11px] font-semibold text-neutral-700 tabular-nums flex-shrink-0"
                        >
                          {limit > 0
                            ? `Teto: ${formatCompactBRL(limit, hideBalances)}`
                            : '+ Definir limite'}
                        </button>
                      )}
                    </div>

                    {limit > 0 && (
                      <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            alertLevel === '100'
                              ? 'bg-red-600'
                              : alertLevel === '80'
                              ? 'bg-amber-500'
                              : 'bg-neutral-900'
                          }`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {expenseCategories.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllCategories((prev) => !prev)}
                className="w-full py-2.5 rounded-2xl bg-[#F6F5F2] text-xs font-semibold text-neutral-700 hover:bg-neutral-200/70 transition"
              >
                {showAllCategories
                  ? 'Mostrar apenas categorias principais'
                  : `Ver todas as categorias (${expenseCategories.length})`}
              </button>
            )}
          </section>
        </div>
      ) : (
        /* ==================== MÓDULO 4: CONTAS FIXAS E RECORRENTES ==================== */
        <div className="space-y-5">
          {/* Detector de Despesas Recorrentes Esquecidas */}
          {forgottenCandidates.length > 0 && (
            <section className="editorial-card rounded-3xl p-5 border-l-4 border-l-neutral-900 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-neutral-900" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
                  Despesas recorrentes identificadas
                </h3>
              </div>
              <p className="text-xs text-neutral-500">
                Encontramos gastos repetidos no seu extrato que ainda não estão cadastrados como conta fixa:
              </p>

              <div className="divide-y divide-neutral-100">
                {forgottenCandidates.map((cand) => (
                  <div
                    key={cand.key}
                    className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2"
                  >
                    <div>
                      <p className="text-xs font-bold text-neutral-900">{cand.description}</p>
                      <p className="text-[11px] text-neutral-400 tabular-nums">
                        Média de {formatBRL(cand.averageAmount, hideBalances)} · todo dia ~
                        {cand.suggestedDay}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() =>
                          onAddBill({
                            name: cand.description,
                            amount: cand.averageAmount,
                            categoryId: cand.categoryId,
                            accountId: accounts[0]?.id || 'principal',
                            paymentMethod: 'pix',
                            frequency: 'monthly',
                            nextDue: `${selectedYm}-${String(cand.suggestedDay).padStart(2, '0')}`,
                            anchorDay: cand.suggestedDay,
                            remindDaysBefore: 3,
                            active: true,
                          })
                        }
                        className="px-2.5 py-1 rounded-full bg-neutral-950 text-white text-[11px] font-semibold"
                      >
                        + Tornar fixa
                      </button>
                      <button
                        onClick={() => onDismissSuggestion(cand.key)}
                        className="p-1 text-neutral-400 hover:text-neutral-700"
                        title="Ignorar sugestão"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Compromissos Fixos + Calendário em Coluna Mobile */}
          <div className="space-y-5">
          {/* Cabeçalho Contas Fixas + Botão Adicionar */}
          <section className="editorial-card rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-neutral-950">
                  Compromissos fixos e assinaturas
                </h3>
                <p className="text-xs text-neutral-400">
                  Aluguel, condomínio, energia, internet e serviços recorrentes
                </p>
              </div>
              <button
                onClick={() => setShowBillModal(true)}
                className="px-3.5 py-2 rounded-full bg-neutral-950 text-white text-xs font-semibold flex items-center gap-1 active:scale-95 transition"
              >
                <Plus className="w-3.5 h-3.5" /> Nova fixa
              </button>
            </div>

            {bills.length === 0 ? (
              <div className="py-6 text-center space-y-2">
                <p className="text-xs text-neutral-400">
                  Nenhuma conta fixa cadastrada ainda.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {bills
                  .slice()
                  .sort((a, b) => a.nextDue.localeCompare(b.nextDue))
                  .map((bill) => {
                    const daysLeft = diffDays(todayISO(), bill.nextDue);
                    const isOverdue = daysLeft < 0;
                    const isSoon = daysLeft >= 0 && daysLeft <= bill.remindDaysBefore;
                    return (
                      <div
                        key={bill.id}
                        className="py-3.5 first:pt-1 last:pb-1 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-semibold text-neutral-900 truncate">
                              {bill.name}
                            </p>
                            <span className="px-2 py-0.5 rounded-full bg-[#F6F5F2] text-[10px] font-medium text-neutral-600">
                              {FREQ_LABEL[bill.frequency]}
                            </span>
                            {(isOverdue || isSoon) && (
                              <span
                                className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  isOverdue
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                <Bell className="w-2.5 h-2.5" />
                                {relativeDue(bill.nextDue)}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-neutral-400 mt-0.5">
                            Próximo vencimento: {bill.nextDue.split('-').reverse().join('/')} ·{' '}
                            {PAYMENT_LABEL[bill.paymentMethod]}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0 tabular-nums">
                          <span className="text-sm font-bold text-neutral-950">
                            {formatBRL(bill.amount, hideBalances)}
                          </span>
                          <button
                            onClick={() => onPayBill(bill)}
                            className="px-3 py-1.5 rounded-full bg-neutral-950 text-white text-[11px] font-semibold active:scale-95 transition"
                            title="Marcar como paga e avançar próximo vencimento"
                          >
                            Pagar
                          </button>
                          <button
                            onClick={() => onDeleteBill(bill.id)}
                            className="p-1 text-neutral-300 hover:text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </section>

          {/* Calendário Financeiro de Vencimentos do Mês */}
          <section className="editorial-card rounded-3xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Calendário de vencimentos ({monthLabel(selectedYm)})
              </h3>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-neutral-400">
              {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
                <div key={i}>{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 text-center tabular-nums">
              {Array.from({ length: calendarDays.startWeekday }).map((_, i) => (
                <div key={`empty-${i}`} className="h-9" />
              ))}
              {Array.from({ length: calendarDays.dim }).map((_, idx) => {
                const dayNum = idx + 1;
                const dueBills = calendarDays.dueDaysMap.get(dayNum) || [];
                const hasDue = dueBills.length > 0;
                return (
                  <div
                    key={dayNum}
                    className={`h-9 rounded-xl flex flex-col items-center justify-center text-xs relative ${
                      hasDue
                        ? 'bg-neutral-950 text-white font-bold'
                        : 'bg-[#F6F5F2]/70 text-neutral-700'
                    }`}
                    title={
                      hasDue
                        ? dueBills.map((b) => `${b.name}: ${formatBRL(b.amount)}`).join(', ')
                        : undefined
                    }
                  >
                    <span>{dayNum}</span>
                    {hasDue && (
                      <span className="w-1 h-1 rounded-full bg-amber-400 mt-0.5" />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          </div>
        </div>
      )}

      {/* Modal Nova Conta Fixa */}
      {showBillModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-4">
          <form
            onSubmit={handleCreateBill}
            className="w-full max-w-md rounded-3xl bg-white p-6 space-y-4 shadow-2xl animate-view"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-neutral-950">Nova conta fixa ou assinatura</h3>
              <button
                type="button"
                onClick={() => setShowBillModal(false)}
                className="text-xs text-neutral-400"
              >
                Fechar
              </button>
            </div>

            <div>
              <label className="text-xs text-neutral-500 block mb-1">Descrição</label>
              <input
                type="text"
                required
                value={billName}
                onChange={(e) => setBillName(e.target.value)}
                placeholder="Ex: Aluguel, Internet Fibra, Energia, iCloud..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Valor (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={billAmount}
                  onChange={(e) => setBillAmount(e.target.value)}
                  placeholder="0,00"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F6F5F2] text-xs font-bold text-neutral-950 tabular-nums"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Próximo vencimento</label>
                <input
                  type="date"
                  required
                  value={billDue}
                  onChange={(e) => setBillDue(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Recorrência</label>
                <select
                  value={billFreq}
                  onChange={(e) => setBillFreq(e.target.value as Frequency)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900"
                >
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensal</option>
                  <option value="yearly">Anual</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Lembrar quantos dias antes</label>
                <select
                  value={billRemind}
                  onChange={(e) => setBillRemind(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900"
                >
                  <option value="1">1 dia antes</option>
                  <option value="3">3 dias antes</option>
                  <option value="5">5 dias antes</option>
                  <option value="7">7 dias antes</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Categoria</label>
                <select
                  value={billCategory}
                  onChange={(e) => setBillCategory(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900"
                >
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Meio de pagamento</label>
                <select
                  value={billMethod}
                  onChange={(e) => setBillMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900"
                >
                  <option value="pix">Pix</option>
                  <option value="boleto">Boleto</option>
                  <option value="credit">Cartão de Crédito</option>
                  <option value="debit">Débito Automático</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-full bg-neutral-950 text-white font-semibold text-xs"
            >
              Salvar conta fixa
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
