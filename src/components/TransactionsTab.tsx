import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Clock,
  Edit3,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
} from 'lucide-react';
import {
  Account,
  Category,
  Transaction,
  TxType,
} from '../types/finance';
import { PAYMENT_LABEL } from '../data/defaults';
import { formatDayHeader, ymOf } from '../utils/date';
import { formatBRL, norm } from '../utils/format';
import { CategoryIcon } from './CategoryIcon';

interface TransactionsTabProps {
  selectedYm: string;
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  hideBalances: boolean;
  onOpenNewTx: (defaultType?: TxType) => void;
  onOpenOpenFinance: () => void;
  onEditTx: (tx: Transaction) => void;
  onDeleteTx: (id: string) => void;
  onToggleTxStatus: (id: string) => void;
}

export const TransactionsTab: React.FC<TransactionsTabProps> = ({
  selectedYm,
  transactions,
  accounts,
  categories,
  hideBalances,
  onOpenNewTx,
  onOpenOpenFinance,
  onEditTx,
  onDeleteTx,
  onToggleTxStatus,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | TxType | 'pending'>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [scopeAllMonths, setScopeAllMonths] = useState<boolean>(false);

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const accMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const filtered = useMemo(() => {
    const q = norm(searchQuery);
    return transactions
      .filter((tx) => {
        if (!scopeAllMonths && ymOf(tx.date) !== selectedYm) return false;
        if (typeFilter === 'pending') {
          if (tx.status !== 'pending') return false;
        } else if (typeFilter !== 'all' && tx.type !== typeFilter) {
          return false;
        }
        if (accountFilter !== 'all' && tx.accountId !== accountFilter && tx.toAccountId !== accountFilter) {
          return false;
        }
        if (categoryFilter !== 'all' && tx.categoryId !== categoryFilter) {
          return false;
        }
        if (q) {
          const catName = catMap.get(tx.categoryId || '')?.name || '';
          const tagsStr = (tx.tags || []).join(' ');
          const hay = norm(`${tx.description} ${catName} ${tagsStr} ${tx.notes || ''}`);
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }, [
    transactions,
    selectedYm,
    scopeAllMonths,
    typeFilter,
    accountFilter,
    categoryFilter,
    searchQuery,
    catMap,
  ]);

  // Agrupamento por data para leitura editorial limpa
  const groupedByDate = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const tx of filtered) {
      const list = map.get(tx.date) || [];
      list.push(tx);
      map.set(tx.date, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const totals = useMemo(() => {
    let inc = 0;
    let exp = 0;
    for (const tx of filtered) {
      if (tx.type === 'income') inc += tx.amount;
      else if (tx.type === 'expense') exp += tx.amount;
    }
    return { inc, exp };
  }, [filtered]);

  return (
    <div className="space-y-4 pb-10 animate-view">
      {/* Cabeçalho + Ações Rápidas */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
            Extrato & Movimentações
          </p>
          <h2 className="text-2xl font-bold text-neutral-950 mt-0.5">Lançamentos</h2>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onOpenOpenFinance}
            className="px-3 py-2 rounded-full bg-white border border-neutral-200/80 text-xs font-semibold text-neutral-800 flex items-center gap-1 active:scale-95 transition"
            title="Importar transações via Open Finance (OFX / CSV)"
          >
            <Building2 className="w-3.5 h-3.5" /> Open Finance
          </button>
          <button
            onClick={() => onOpenNewTx('transfer')}
            className="px-2.5 py-2 rounded-full bg-white border border-neutral-200/80 text-xs font-semibold text-neutral-800 flex items-center gap-1 active:scale-95 transition"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onOpenNewTx('expense')}
            className="px-3 py-2 rounded-full bg-neutral-950 text-white text-xs font-semibold flex items-center gap-1 active:scale-95 transition"
          >
            <Plus className="w-3.5 h-3.5" /> Novo
          </button>
        </div>
      </div>

      {/* Barra de Busca + Escopo Mensal/Geral */}
      <div className="editorial-card rounded-2xl p-2.5 flex items-center gap-2">
        <Search className="w-4 h-4 text-neutral-400 ml-1.5 flex-shrink-0" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar descrição, #tag, observação ou categoria..."
          className="flex-1 bg-transparent text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
        />
        <button
          onClick={() => setScopeAllMonths((prev) => !prev)}
          className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold transition flex-shrink-0 ${
            scopeAllMonths ? 'bg-neutral-900 text-white' : 'bg-[#F6F5F2] text-neutral-600'
          }`}
        >
          {scopeAllMonths ? 'Todos os meses' : 'Mês atual'}
        </button>
      </div>

      {/* Filtros Rápidos por Tipo, Conta e Categoria */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {(
          [
            { id: 'all', label: 'Todos' },
            { id: 'expense', label: 'Despesas' },
            { id: 'income', label: 'Receitas' },
            { id: 'transfer', label: 'Transferências' },
            { id: 'pending', label: 'Pendentes' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            onClick={() => setTypeFilter(item.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 transition ${
              typeFilter === item.id
                ? 'bg-neutral-950 text-white'
                : 'bg-white border border-neutral-200/80 text-neutral-600'
            }`}
          >
            {item.label}
          </button>
        ))}

        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white border border-neutral-200/80 text-neutral-700 flex-shrink-0"
        >
          <option value="all">Todas as contas</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white border border-neutral-200/80 text-neutral-700 flex-shrink-0"
        >
          <option value="all">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Resumo Rápido do Filtro Atual */}
      <div className="flex items-center justify-between px-1 text-xs text-neutral-500 tabular-nums">
        <span>{filtered.length} lançamento(s)</span>
        <div className="flex items-center gap-3">
          <span className="text-emerald-700 font-semibold">
            +{formatBRL(totals.inc, hideBalances)}
          </span>
          <span className="text-neutral-900 font-semibold">
            -{formatBRL(totals.exp, hideBalances)}
          </span>
        </div>
      </div>

      {/* Lista Agrupada por Dia */}
      {groupedByDate.length === 0 ? (
        <div className="editorial-card rounded-3xl p-8 text-center space-y-3">
          <p className="text-sm font-semibold text-neutral-900">
            Nenhum lançamento encontrado
          </p>
          <p className="text-xs text-neutral-500 max-w-xs mx-auto leading-relaxed">
            Cadastre receitas, despesas ou transferências entre suas contas sem duplicar seu orçamento.
          </p>
          <button
            onClick={() => onOpenNewTx('expense')}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" /> Criar lançamento
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByDate.map(([dateIso, items]) => (
            <div key={dateIso} className="space-y-1.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 px-1">
                {formatDayHeader(dateIso)}
              </h3>
              <div className="editorial-card rounded-3xl divide-y divide-neutral-100 overflow-hidden">
                {items.map((tx) => {
                  const cat = catMap.get(tx.categoryId || '');
                  const fromAcc = accMap.get(tx.accountId);
                  const toAcc = tx.toAccountId ? accMap.get(tx.toAccountId) : undefined;
                  const isTransfer = tx.type === 'transfer';
                  const isIncome = tx.type === 'income';
                  const isInv = tx.type === 'investment';

                  return (
                    <div key={tx.id} className="p-4 space-y-2 hover:bg-neutral-50/60 transition">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                              isTransfer
                                ? 'bg-neutral-200 text-neutral-800'
                                : isIncome
                                ? 'bg-emerald-100 text-emerald-800'
                                : isInv
                                ? 'bg-neutral-900 text-white'
                                : 'bg-[#F6F5F2] text-neutral-800'
                            }`}
                          >
                            {isTransfer ? (
                              <ArrowLeftRight className="w-4 h-4" />
                            ) : isIncome ? (
                              <ArrowDownLeft className="w-4 h-4" />
                            ) : isInv ? (
                              <Sparkles className="w-4 h-4" />
                            ) : (
                              <CategoryIcon name={cat?.icon} className="w-4 h-4" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-sm font-semibold text-neutral-900 truncate">
                                {tx.description}
                              </p>
                              {tx.installment && (
                                <span className="px-1.5 py-0.5 rounded-md bg-neutral-100 text-neutral-700 text-[10px] font-semibold tabular-nums">
                                  {tx.installment.index}/{tx.installment.total}
                                </span>
                              )}
                              {tx.status === 'pending' && (
                                <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-semibold flex items-center gap-0.5">
                                  <Clock className="w-2.5 h-2.5" /> Pendente
                                </span>
                              )}
                            </div>

                            <p className="text-[11px] text-neutral-400 mt-0.5">
                              {isTransfer ? (
                                <>
                                  {fromAcc?.name || 'Conta'} → {toAcc?.name || 'Destino'} · Não afeta receitas/despesas
                                </>
                              ) : (
                                <>
                                  {cat?.name || (isInv ? 'Aporte em Meta' : 'Geral')}
                                  {fromAcc ? ` · ${fromAcc.name}` : ''}
                                  {tx.paymentMethod ? ` · ${PAYMENT_LABEL[tx.paymentMethod]}` : ''}
                                </>
                              )}
                            </p>

                            {tx.notes && (
                              <p className="text-[11px] text-neutral-500 italic mt-1">
                                "{tx.notes}"
                              </p>
                            )}

                            {tx.tags && tx.tags.length > 0 && (
                              <div className="flex items-center gap-1 flex-wrap mt-1.5">
                                {tx.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-[#F6F5F2] text-[10px] font-medium text-neutral-600"
                                  >
                                    <Tag className="w-2.5 h-2.5" /> {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0 tabular-nums">
                          <p
                            className={`text-sm font-bold ${
                              isTransfer
                                ? 'text-neutral-600'
                                : isIncome
                                ? 'text-emerald-700'
                                : 'text-neutral-950'
                            }`}
                          >
                            {isTransfer ? '⇄ ' : isIncome ? '+ ' : '- '}
                            {formatBRL(tx.amount, hideBalances)}
                          </p>

                          <div className="flex items-center justify-end gap-1 mt-1.5">
                            <button
                              onClick={() => onToggleTxStatus(tx.id)}
                              className={`p-1 rounded-lg text-[10px] font-medium ${
                                tx.status === 'paid'
                                  ? 'text-emerald-700 hover:bg-emerald-50'
                                  : 'text-amber-700 bg-amber-50'
                              }`}
                              title={tx.status === 'paid' ? 'Pago (toque p/ pendente)' : 'Marcar como pago'}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onEditTx(tx)}
                              className="p-1 text-neutral-400 hover:text-neutral-900"
                              title="Editar lançamento"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onDeleteTx(tx.id)}
                              className="p-1 text-neutral-300 hover:text-red-600"
                              title="Excluir lançamento"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
