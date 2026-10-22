import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Building2,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Plus,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  Account,
  AppTab,
  Bill,
  Budget,
  Category,
  Debt,
  PayrollConfig,
  StrategicGoal,
  Transaction,
} from '../types/finance';
import {
  computeAccountBalances,
  computeBalanceEvolution,
  computeBudgetStatuses,
  computeMonthlySummary,
} from '../utils/analytics';
import { calculatePayrollMonth } from '../services/payrollService';
import { formatShortDate, monthLabel, relativeDue, shiftYM, todayISO } from '../utils/date';
import { formatBRL, formatCompactBRL, formatPct, parseMoney, toInputMoney } from '../utils/format';
import { CategoryIcon } from './CategoryIcon';
import { ACCOUNT_TYPE_LABEL } from '../data/defaults';

interface HomeDashboardTabProps {
  selectedYm: string;
  onChangeYm: (ym: string) => void;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  bills: Bill[];
  debts: Debt[];
  payroll?: PayrollConfig;
  goals: StrategicGoal[];
  hideBalances: boolean;
  onOpenNewTx: (defaultType?: 'expense' | 'income' | 'transfer') => void;
  onOpenOpenFinance: () => void;
  onOpenPayroll: () => void;
  onUpdateAccountBalance: (accountId: string, newInitialBalance: number) => void;
  onManageAccounts: () => void;
  onPayBill: (bill: Bill) => void;
  onMarkTxPaid: (txId: string) => void;
  onNavigateTab: (tab: AppTab) => void;
}

export const HomeDashboardTab: React.FC<HomeDashboardTabProps> = ({
  selectedYm,
  onChangeYm,
  accounts,
  categories,
  transactions,
  budgets,
  bills,
  debts,
  payroll,
  hideBalances,
  onOpenNewTx,
  onOpenOpenFinance,
  onOpenPayroll,
  onUpdateAccountBalance,
  onManageAccounts,
  onPayBill,
  onMarkTxPaid,
  onNavigateTab,
}) => {
  const [chartMode, setChartMode] = useState<'evolution' | 'comparison'>('evolution');
  const [editingAccId, setEditingAccId] = useState<string | null>(null);
  const [accBalanceInput, setAccBalanceInput] = useState<string>('');

  const accountBalances = useMemo(
    () => computeAccountBalances(accounts, transactions),
    [accounts, transactions]
  );

  const totalAvailableBalance = useMemo(
    () =>
      accounts
        .filter((a) => !a.archived)
        .reduce((acc, a) => acc + (accountBalances[a.id] || 0), 0),
    [accounts, accountBalances]
  );

  const summary = useMemo(
    () => computeMonthlySummary(selectedYm, transactions, bills, categories),
    [selectedYm, transactions, bills, categories]
  );

  const payrollCalc = useMemo(
    () => (payroll?.enabled ? calculatePayrollMonth(payroll, selectedYm) : null),
    [payroll, selectedYm]
  );

  const evolution = useMemo(
    () => computeBalanceEvolution(accounts, transactions, selectedYm),
    [accounts, transactions, selectedYm]
  );

  const budgetAlerts = useMemo(
    () =>
      computeBudgetStatuses(selectedYm, budgets, transactions, categories).filter(
        (b) => b.alertLevel !== 'ok'
      ),
    [selectedYm, budgets, transactions, categories]
  );

  const upcomingItems = useMemo(() => {
    const today = todayISO();
    const activeBills = bills
      .filter((b) => b.active)
      .sort((a, b) => a.nextDue.localeCompare(b.nextDue))
      .slice(0, 4);

    const pendingTxs = transactions
      .filter((t) => t.status === 'pending' && t.type !== 'transfer')
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4);

    return { today, activeBills, pendingTxs };
  }, [bills, transactions]);

  const activeDebts = useMemo(
    () => debts.filter((d) => d.currentBalance > 0.01),
    [debts]
  );

  const isBrandNewUser =
    transactions.length === 0 &&
    Math.abs(totalAvailableBalance) < 0.01 &&
    bills.length === 0 &&
    activeDebts.length === 0;

  const hasFinancialActivity =
    transactions.length > 0 || Math.abs(totalAvailableBalance) >= 0.01;

  const svgEvolutionPoints = useMemo(() => {
    if (evolution.length === 0) return { polyline: '', area: '', min: 0, max: 0 };
    const values = evolution.map((e) => e.balance);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 100);
    const range = Math.max(1, max - min);
    const width = 280;
    const height = 84;

    const coords = evolution.map((item, idx) => {
      const x = (idx / Math.max(1, evolution.length - 1)) * width;
      const y = height - ((item.balance - min) / range) * (height - 18) - 9;
      return { x, y, item };
    });

    const polyline = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const area = `0,${height} ${polyline} ${width},${height}`;
    return { coords, polyline, area, min, max };
  }, [evolution]);

  return (
    <div className="space-y-4 pb-8 animate-view">
      {/* Linha Única Compacta: Seletor de Mês + Botão Open Finance */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-white border border-neutral-200/80 rounded-full px-1.5 py-1">
          <button
            onClick={() => onChangeYm(shiftYM(selectedYm, -1))}
            className="w-7 h-7 rounded-full flex items-center justify-center text-neutral-600 active:scale-90 transition"
            title="Mês anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-semibold text-neutral-900 px-1.5 min-w-[105px] text-center">
            {monthLabel(selectedYm)}
          </span>
          <button
            onClick={() => onChangeYm(shiftYM(selectedYm, 1))}
            className="w-7 h-7 rounded-full flex items-center justify-center text-neutral-600 active:scale-90 transition"
            title="Próximo mês"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={onOpenOpenFinance}
          className="px-3.5 py-2 rounded-full bg-white border border-neutral-200/80 text-neutral-900 text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition"
        >
          <Building2 className="w-3.5 h-3.5 text-neutral-700" />
          Open Finance
        </button>
      </div>

      {/* 1. CARD PRINCIPAL: SALDO TOTAL DISPONÍVEL + CONTAS COM EDIÇÃO DIRETA */}
      <section className="editorial-card rounded-3xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Saldo total disponível
            </p>
            <h2 className="text-3xl leading-none font-bold tracking-tight text-neutral-950 tabular-nums mt-1.5">
              {formatBRL(totalAvailableBalance, hideBalances)}
            </h2>
          </div>

          <button
            onClick={() => onOpenNewTx('transfer')}
            className="px-3 py-1.5 rounded-full bg-[#F6F5F2] text-[11px] font-semibold text-neutral-800 flex items-center gap-1 active:scale-95 transition flex-shrink-0"
          >
            <ArrowLeftRight className="w-3 h-3" /> Transferir
          </button>
        </div>

        {/* Lista Horizontal de Contas (Toque para ajustar o saldo inicial na hora!) */}
        <div className="space-y-2">
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {accounts.map((acc) => {
              const isEditingThis = editingAccId === acc.id;
              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => {
                    setAccBalanceInput(toInputMoney(acc.initialBalance));
                    setEditingAccId(isEditingThis ? null : acc.id);
                  }}
                  className={`flex-shrink-0 px-3.5 py-2.5 rounded-2xl text-left transition min-w-[142px] border ${
                    isEditingThis
                      ? 'bg-neutral-950 text-white border-neutral-950'
                      : 'bg-[#F6F5F2] text-neutral-900 border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: acc.color }}
                      />
                      <span className="text-xs font-semibold truncate">{acc.name}</span>
                    </div>
                    <Edit3
                      className={`w-3 h-3 flex-shrink-0 ${
                        isEditingThis ? 'text-neutral-300' : 'text-neutral-400'
                      }`}
                    />
                  </div>
                  <p
                    className={`text-[10px] mt-0.5 ${
                      isEditingThis ? 'text-neutral-400' : 'text-neutral-400'
                    }`}
                  >
                    {ACCOUNT_TYPE_LABEL[acc.type]}
                  </p>
                  <p className="text-xs font-bold tabular-nums mt-1">
                    {formatBRL(accountBalances[acc.id] || 0, hideBalances)}
                  </p>
                </button>
              );
            })}

            <button
              type="button"
              onClick={onManageAccounts}
              className="flex-shrink-0 px-3.5 py-2.5 rounded-2xl bg-[#F6F5F2]/70 text-neutral-500 hover:text-neutral-900 text-xs font-semibold flex flex-col justify-center items-center min-w-[96px]"
            >
              <Plus className="w-4 h-4 mb-0.5" />
              <span>+ Conta</span>
            </button>
          </div>

          {/* Editor Rápido de Saldo Inicial sem sair da Tela Inicial */}
          {editingAccId && (
            <div className="p-3 rounded-2xl bg-[#F6F5F2] flex items-center justify-between gap-2 animate-view">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-neutral-900 truncate">
                  Saldo inicial ({accounts.find((a) => a.id === editingAccId)?.name})
                </p>
                <p className="text-[10px] text-neutral-500">
                  Valor que já estava na conta antes dos lançamentos
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={accBalanceInput}
                  onChange={(e) => setAccBalanceInput(e.target.value)}
                  placeholder="0,00"
                  className="w-24 px-2.5 py-1.5 rounded-xl bg-white text-xs font-bold text-neutral-950 tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => {
                    onUpdateAccountBalance(editingAccId, parseMoney(accBalanceInput));
                    setEditingAccId(null);
                  }}
                  className="p-2 rounded-xl bg-neutral-950 text-white"
                  title="Salvar saldo"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingAccId(null)}
                  className="p-2 rounded-xl bg-white text-neutral-500"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Receitas, Despesas e Resultado do Mês */}
        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-neutral-100 tabular-nums">
          <div>
            <span className="text-[11px] text-neutral-400 flex items-center gap-1">
              <ArrowDownLeft className="w-3 h-3 text-emerald-700" /> Receitas
            </span>
            <p className="text-sm font-bold text-emerald-700 mt-0.5">
              {formatCompactBRL(summary.paidIncome, hideBalances)}
            </p>
          </div>
          <div>
            <span className="text-[11px] text-neutral-400 flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3 text-neutral-900" /> Despesas
            </span>
            <p className="text-sm font-bold text-neutral-900 mt-0.5">
              {formatCompactBRL(summary.paidExpense, hideBalances)}
            </p>
          </div>
          <div>
            <span className="text-[11px] text-neutral-400 flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-neutral-500" /> Balanço
            </span>
            <p
              className={`text-sm font-bold mt-0.5 ${
                summary.netFlow >= 0 ? 'text-emerald-700' : 'text-red-600'
              }`}
            >
              {summary.netFlow >= 0 ? '+' : ''}
              {formatCompactBRL(summary.netFlow, hideBalances)}
            </p>
          </div>
        </div>
      </section>

      {/* Card do Salário & Holerite CLT Automático */}
      {payrollCalc && payrollCalc.grossSalary > 0 ? (
        <section
          onClick={onOpenPayroll}
          className="editorial-card rounded-3xl p-4 cursor-pointer active:scale-[0.99] transition flex items-center justify-between gap-3 border-l-4 border-l-emerald-600"
        >
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                Salário CLT Recorrente ({monthLabel(selectedYm)})
              </span>
              <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold">
                Automático
              </span>
            </div>
            <p className="text-base font-bold text-emerald-700 tabular-nums mt-0.5">
              Líquido: {formatBRL(payrollCalc.netSalary, hideBalances)}
            </p>
            <p className="text-[11px] text-neutral-500 tabular-nums mt-0.5">
              Bruto {formatBRL(payrollCalc.grossSalary, hideBalances)} · Descontos -{formatBRL(payrollCalc.totalDeductions, hideBalances)} · Crédito{' '}
              {payrollCalc.payDate.split('-').reverse().join('/')}
            </p>
          </div>
          <span className="px-3 py-1.5 rounded-full bg-[#F6F5F2] text-xs font-semibold text-neutral-900 flex-shrink-0">
            Holerite →
          </span>
        </section>
      ) : (
        <section
          onClick={onOpenPayroll}
          className="editorial-card rounded-3xl p-4 cursor-pointer active:scale-[0.99] transition flex items-center justify-between gap-3 border-l-4 border-l-emerald-600"
        >
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
              Automação CLT · Dias Úteis & INSS
            </span>
            <p className="text-xs font-bold text-neutral-950 mt-0.5">
              Configurar Salário & Holerite Automático
            </p>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              Cálculo automático de INSS/IRRF e lançamento todo último dia útil
            </p>
          </div>
          <span className="px-3 py-1.5 rounded-full bg-[#F6F5F2] text-xs font-semibold text-neutral-900 flex-shrink-0">
            Configurar →
          </span>
        </section>
      )}

      {/* GUIA DE PRIMEIRO USO (Exibido apenas quando o usuário acabou de começar do zero) */}
      {isBrandNewUser && (
        <section className="editorial-card rounded-3xl p-5 space-y-3.5 border-l-4 border-l-neutral-950">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-neutral-900" />
            <h3 className="text-sm font-bold text-neutral-950">
              Comece em 3 passos simples
            </h3>
          </div>
          <p className="text-xs text-neutral-500 leading-relaxed">
            Seu aplicativo está limpo e pronto para uso. Escolha como prefere dar o primeiro passo:
          </p>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                const firstAcc = accounts[0];
                if (firstAcc) {
                  setAccBalanceInput(toInputMoney(firstAcc.initialBalance));
                  setEditingAccId(firstAcc.id);
                }
              }}
              className="w-full p-3 rounded-2xl bg-[#F6F5F2] hover:bg-neutral-200/70 text-left flex items-center justify-between transition"
            >
              <div>
                <p className="text-xs font-bold text-neutral-950">
                  1. Informar meu saldo atual no banco
                </p>
                <p className="text-[11px] text-neutral-500">
                  Toque aqui ou no card da "Conta principal" acima
                </p>
              </div>
              <span className="text-xs font-bold text-neutral-900">Ajustar →</span>
            </button>

            <button
              type="button"
              onClick={onOpenOpenFinance}
              className="w-full p-3 rounded-2xl bg-[#F6F5F2] hover:bg-neutral-200/70 text-left flex items-center justify-between transition"
            >
              <div>
                <p className="text-xs font-bold text-neutral-950">
                  2. Importar extrato via Open Finance (.OFX / .CSV)
                </p>
                <p className="text-[11px] text-neutral-500">
                  Traga seus lançamentos do Nubank, Itaú, Inter, BTG ou Bradesco
                </p>
              </div>
              <span className="text-xs font-bold text-neutral-900">Importar →</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenNewTx('expense')}
              className="w-full p-3 rounded-2xl bg-neutral-950 text-white text-left flex items-center justify-between transition"
            >
              <div>
                <p className="text-xs font-bold">
                  3. Registrar lançamento manual
                </p>
                <p className="text-[11px] text-neutral-300">
                  Cadastre uma receita ou despesa em segundos
                </p>
              </div>
              <span className="text-xs font-bold">+ Lançar →</span>
            </button>
          </div>
        </section>
      )}

      {/* 2. CONTAS A PAGAR & VALORES A RECEBER */}
      <section className="grid grid-cols-2 gap-3 tabular-nums">
        <div
          onClick={() => onNavigateTab('plan')}
          className="editorial-card rounded-3xl p-4 cursor-pointer active:scale-[0.99] transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500">Contas a pagar</span>
            <CalendarClock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-lg font-bold text-neutral-950 mt-1.5">
            {formatBRL(summary.pendingPayables, hideBalances)}
          </p>
          <p className="text-[11px] text-neutral-400 mt-0.5">
            Fixas do mês + pendentes
          </p>
        </div>

        <div
          onClick={() => onNavigateTab('tx')}
          className="editorial-card rounded-3xl p-4 cursor-pointer active:scale-[0.99] transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500">Valores a receber</span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-700" />
          </div>
          <p className="text-lg font-bold text-emerald-700 mt-1.5">
            {formatBRL(summary.pendingReceivables, hideBalances)}
          </p>
          <p className="text-[11px] text-neutral-400 mt-0.5">
            Entradas previstas no mês
          </p>
        </div>
      </section>

      {/* Alertas de Orçamento (50%, 80%, 100%) */}
      {budgetAlerts.length > 0 && (
        <section
          onClick={() => onNavigateTab('plan')}
          className="editorial-card rounded-3xl p-4 border-l-4 border-l-amber-500 cursor-pointer space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Alertas de orçamento neste mês
            </span>
            <span className="text-[11px] font-medium text-neutral-400">Ver todos →</span>
          </div>
          <div className="space-y-1.5">
            {budgetAlerts.slice(0, 3).map((b) => (
              <div
                key={b.category.id}
                className="flex items-center justify-between text-xs tabular-nums"
              >
                <span className="text-neutral-700 font-medium">{b.category.name}</span>
                <span
                  className={`font-semibold px-2 py-0.5 rounded-full text-[11px] ${
                    b.alertLevel === '100'
                      ? 'bg-red-100 text-red-700'
                      : b.alertLevel === '80'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-neutral-100 text-neutral-700'
                  }`}
                >
                  {formatPct(b.pct, 0)} ({formatCompactBRL(b.spent, hideBalances)} /{' '}
                  {formatCompactBRL(b.limit, hideBalances)})
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Próximos Vencimentos Rápidos */}
      {(upcomingItems.activeBills.length > 0 || upcomingItems.pendingTxs.length > 0) && (
        <section className="editorial-card rounded-3xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Próximos compromissos
            </h3>
            <button
              onClick={() => onNavigateTab('plan')}
              className="text-xs font-medium text-neutral-500 hover:text-neutral-900"
            >
              Calendário →
            </button>
          </div>

          <div className="divide-y divide-neutral-100">
            {upcomingItems.activeBills.map((bill) => {
              const isOverdue = bill.nextDue < upcomingItems.today;
              return (
                <div
                  key={bill.id}
                  className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2"
                >
                  <div>
                    <p className="text-xs font-semibold text-neutral-900">{bill.name}</p>
                    <p
                      className={`text-[11px] ${
                        isOverdue ? 'text-red-600 font-semibold' : 'text-neutral-400'
                      }`}
                    >
                      {relativeDue(bill.nextDue)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 tabular-nums">
                    <span className="text-xs font-bold text-neutral-900">
                      {formatBRL(bill.amount, hideBalances)}
                    </span>
                    <button
                      onClick={() => onPayBill(bill)}
                      className="px-2.5 py-1 rounded-full bg-neutral-950 text-white text-[11px] font-semibold active:scale-95 transition"
                    >
                      Pagar
                    </button>
                  </div>
                </div>
              );
            })}

            {upcomingItems.pendingTxs.map((tx) => (
              <div
                key={tx.id}
                className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2"
              >
                <div>
                  <p className="text-xs font-semibold text-neutral-900">{tx.description}</p>
                  <p className="text-[11px] text-neutral-400">
                    Previsto para {formatShortDate(tx.date)}
                  </p>
                </div>
                <div className="flex items-center gap-2.5 tabular-nums">
                  <span
                    className={`text-xs font-bold ${
                      tx.type === 'income' ? 'text-emerald-700' : 'text-neutral-900'
                    }`}
                  >
                    {tx.type === 'income' ? '+' : '-'} {formatBRL(tx.amount, hideBalances)}
                  </span>
                  <button
                    onClick={() => onMarkTxPaid(tx.id)}
                    className="px-2.5 py-1 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-900 text-[11px] font-semibold"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Resumo de Dívidas (Exibido apenas se houver contratos ativos para não poluir a tela) */}
      {activeDebts.length > 0 && (
        <section
          onClick={() => onNavigateTab('debts')}
          className="editorial-card rounded-3xl p-4 cursor-pointer active:scale-[0.99] transition flex items-center justify-between gap-3"
        >
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block">
              Dívidas & Empréstimos Ativos
            </span>
            <p className="text-base font-bold text-neutral-950 tabular-nums mt-0.5">
              Saldo devedor:{' '}
              {formatBRL(
                activeDebts.reduce((acc, d) => acc + d.currentBalance, 0),
                hideBalances
              )}
            </p>
            <p className="text-[11px] text-neutral-400 tabular-nums">
              {activeDebts.length} contrato(s) · Simular quitação →
            </p>
          </div>
          <span className="px-3 py-1.5 rounded-full bg-[#F6F5F2] text-xs font-semibold text-neutral-900 flex-shrink-0">
            Ver
          </span>
        </section>
      )}

      {/* 3. GRÁFICO DE GASTOS POR CATEGORIA */}
      <section className="editorial-card rounded-3xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Gastos por categoria
          </h3>
          <button
            onClick={() => onNavigateTab('plan')}
            className="text-xs font-medium text-neutral-500 hover:text-neutral-900"
          >
            Definir limites →
          </button>
        </div>

        {summary.byCategory.length === 0 ? (
          <div className="py-5 text-center space-y-2">
            <p className="text-xs text-neutral-400">
              Nenhuma despesa registrada em {monthLabel(selectedYm)}.
            </p>
            {!isBrandNewUser && (
              <button
                onClick={() => onOpenNewTx('expense')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-neutral-950 text-white text-xs font-semibold active:scale-95 transition"
              >
                <Plus className="w-3.5 h-3.5" /> Registrar despesa
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="w-full h-3 rounded-full overflow-hidden flex bg-neutral-100 gap-0.5">
              {summary.byCategory.map((item) => (
                <div
                  key={item.category.id}
                  style={{
                    width: `${Math.max(2, item.pct)}%`,
                    backgroundColor: item.category.color,
                  }}
                  title={`${item.category.name}: ${formatBRL(item.amount)}`}
                />
              ))}
            </div>

            <div className="space-y-3 pt-1">
              {summary.byCategory.map((item) => (
                <div
                  key={item.category.id}
                  className="flex items-center justify-between text-xs tabular-nums"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-7 h-7 rounded-xl flex items-center justify-center text-white flex-shrink-0"
                      style={{ backgroundColor: item.category.color }}
                    >
                      <CategoryIcon name={item.category.icon} className="w-3.5 h-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-neutral-900 truncate">
                        {item.category.name}
                      </p>
                      {item.deltaPct !== null && (
                        <p className="text-[10px] text-neutral-400">
                          {item.deltaPct > 0 ? '+' : ''}
                          {formatPct(item.deltaPct, 0)} vs. mês anterior
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-neutral-900">
                      {formatBRL(item.amount, hideBalances)}
                    </p>
                    <p className="text-[10px] text-neutral-400">{formatPct(item.pct, 0)}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* 4. EVOLUÇÃO DO SALDO AO LONGO DO TEMPO (Revelado assim que houver saldo ou lançamentos) */}
      {hasFinancialActivity && (
        <section className="editorial-card rounded-3xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              {chartMode === 'evolution' ? 'Evolução do saldo (6m)' : 'Entradas vs. Saídas (6m)'}
            </h3>
            <div className="flex bg-[#F6F5F2] p-0.5 rounded-xl text-[11px] font-medium">
              <button
                onClick={() => setChartMode('evolution')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  chartMode === 'evolution'
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-500'
                }`}
              >
                Saldo
              </button>
              <button
                onClick={() => setChartMode('comparison')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  chartMode === 'comparison'
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-500'
                }`}
              >
                Fluxo
              </button>
            </div>
          </div>

          {chartMode === 'evolution' ? (
            <div className="space-y-2">
              <div className="w-full h-28">
                <svg viewBox="0 0 280 84" className="w-full h-full overflow-visible">
                  <defs>
                    <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#111111" stopOpacity="0.14" />
                      <stop offset="100%" stopColor="#111111" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  {svgEvolutionPoints.area && (
                    <polygon points={svgEvolutionPoints.area} fill="url(#balFill)" />
                  )}
                  {svgEvolutionPoints.polyline && (
                    <polyline
                      fill="none"
                      stroke="#111111"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={svgEvolutionPoints.polyline}
                    />
                  )}
                  {svgEvolutionPoints.coords?.map((c) => (
                    <circle
                      key={c.item.ym}
                      cx={c.x}
                      cy={c.y}
                      r="3.2"
                      className="fill-neutral-950 stroke-white stroke-2"
                    />
                  ))}
                </svg>
              </div>
              <div className="grid grid-cols-6 gap-1 text-center pt-1 tabular-nums">
                {evolution.map((e) => (
                  <div key={e.ym}>
                    <p className="text-[10px] font-medium text-neutral-400">{e.label}</p>
                    <p className="text-[10px] font-semibold text-neutral-800 truncate">
                      {formatCompactBRL(e.balance, hideBalances)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-6 gap-2 items-end h-28 pt-2">
                {evolution.map((e) => {
                  const maxBar = Math.max(
                    1,
                    ...evolution.map((x) => Math.max(x.income, x.expense))
                  );
                  const incH = Math.max(4, Math.round((e.income / maxBar) * 76));
                  const expH = Math.max(4, Math.round((e.expense / maxBar) * 76));
                  return (
                    <div key={e.ym} className="flex flex-col items-center gap-1">
                      <div className="flex items-end gap-1 h-20">
                        <div
                          className="w-2.5 bg-emerald-600 rounded-t"
                          style={{ height: `${incH}px` }}
                          title={`Entradas: ${formatBRL(e.income)}`}
                        />
                        <div
                          className="w-2.5 bg-neutral-900 rounded-t"
                          style={{ height: `${expH}px` }}
                          title={`Saídas: ${formatBRL(e.expense)}`}
                        />
                      </div>
                      <span className="text-[10px] font-medium text-neutral-400">{e.label}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-center gap-4 text-[11px] text-neutral-500 pt-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600" /> Entradas
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-neutral-900" /> Saídas
                </span>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
