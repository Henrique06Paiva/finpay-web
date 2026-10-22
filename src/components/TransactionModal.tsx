import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import {
  Account,
  Category,
  PaymentMethod,
  StrategicGoal,
  Transaction,
  TxStatus,
  TxType,
} from '../types/finance';
import { todayISO } from '../utils/date';
import { formatBRL, parseMoney, toInputMoney } from '../utils/format';

interface TransactionModalProps {
  isOpen: boolean;
  defaultType?: TxType;
  editingTx?: Transaction | null;
  accounts: Account[];
  categories: Category[];
  goals: StrategicGoal[];
  onClose: () => void;
  onSave: (
    tx: Omit<Transaction, 'id' | 'createdAt'>,
    existingId?: string,
    installmentsCount?: number
  ) => void;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  defaultType = 'expense',
  editingTx = null,
  accounts,
  categories,
  goals,
  onClose,
  onSave,
}) => {
  const [type, setType] = useState<TxType>(defaultType);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [categoryId, setCategoryId] = useState('alimentacao');
  const [accountId, setAccountId] = useState(accounts[0]?.id || 'principal');
  const [toAccountId, setToAccountId] = useState(
    accounts[1]?.id || accounts[0]?.id || 'carteira'
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [installments, setInstallments] = useState<number>(1);
  const [status, setStatus] = useState<TxStatus>('paid');
  const [tagsInput, setTagsInput] = useState('');
  const [notes, setNotes] = useState('');
  const [goalId, setGoalId] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (editingTx) {
      setType(editingTx.type);
      setDescription(editingTx.description);
      setAmount(toInputMoney(editingTx.amount));
      setDate(editingTx.date);
      setCategoryId(
        editingTx.categoryId || (editingTx.type === 'income' ? 'salario' : 'alimentacao')
      );
      setAccountId(editingTx.accountId || accounts[0]?.id || 'principal');
      setToAccountId(
        editingTx.toAccountId ||
          accounts.find((a) => a.id !== editingTx.accountId)?.id ||
          accounts[0]?.id ||
          'carteira'
      );
      setPaymentMethod(editingTx.paymentMethod || 'pix');
      setInstallments(1);
      setStatus(editingTx.status || 'paid');
      setTagsInput((editingTx.tags || []).join(', '));
      setNotes(editingTx.notes || '');
      setGoalId(editingTx.goalId || '');
      setShowAdvanced(Boolean(editingTx.notes || (editingTx.tags && editingTx.tags.length > 0)));
    } else {
      setType(defaultType);
      setDescription('');
      setAmount('');
      setDate(todayISO());
      setCategoryId(defaultType === 'income' ? 'salario' : 'alimentacao');
      setAccountId(accounts[0]?.id || 'principal');
      setToAccountId(accounts[1]?.id || accounts[0]?.id || 'carteira');
      setPaymentMethod('pix');
      setInstallments(1);
      setStatus('paid');
      setTagsInput('');
      setNotes('');
      setGoalId('');
      setShowAdvanced(false);
    }
  }, [editingTx, defaultType, isOpen, accounts]);

  if (!isOpen) return null;

  const filteredCategories = categories.filter((c) =>
    type === 'income' ? c.kind === 'income' : c.kind === 'expense'
  );

  const numericAmount = parseMoney(amount);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (numericAmount <= 0) return;

    const tags = tagsInput
      .split(',')
      .map((t) => t.replace(/^#/, '').trim())
      .filter(Boolean);

    const finalDesc =
      description.trim() ||
      (type === 'transfer'
        ? 'Transferência entre contas'
        : type === 'investment'
        ? 'Aporte em meta'
        : 'Lançamento');

    onSave(
      {
        type,
        description: finalDesc,
        amount: numericAmount,
        date,
        categoryId:
          type === 'transfer' || type === 'investment' ? undefined : categoryId,
        accountId,
        toAccountId: type === 'transfer' ? toAccountId : undefined,
        paymentMethod: type === 'transfer' ? 'transfer' : paymentMethod,
        status: type === 'transfer' ? 'paid' : status,
        tags,
        notes: notes.trim() || undefined,
        goalId: type === 'investment' && goalId ? goalId : undefined,
      },
      editingTx?.id,
      !editingTx && type === 'expense' && paymentMethod === 'credit' ? installments : 1
    );

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 space-y-3.5 shadow-2xl animate-view max-h-[92dvh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-neutral-950">
            {editingTx ? 'Editar lançamento' : 'Novo lançamento'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Seletor de Tipo (Despesa / Receita / Transferência / Aporte) */}
        <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-[#F6F5F2] text-xs font-semibold">
          {(
            [
              { id: 'expense', label: 'Despesa' },
              { id: 'income', label: 'Receita' },
              { id: 'transfer', label: 'Transf.' },
              { id: 'investment', label: 'Aporte' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setType(t.id);
                if (t.id === 'income') setCategoryId('salario');
                else if (t.id === 'expense') setCategoryId('alimentacao');
              }}
              className={`py-2 rounded-xl transition ${
                type === t.id ? 'bg-neutral-950 text-white shadow-xs' : 'text-neutral-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="text-[11px] text-neutral-500 block mb-1">Valor total (R$)</label>
            <input
              type="text"
              inputMode="decimal"
              required
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#F6F5F2] text-base font-bold text-neutral-950 tabular-nums"
            />
          </div>
          <div>
            <label className="text-[11px] text-neutral-500 block mb-1">Data</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-[#F6F5F2] text-xs font-medium text-neutral-900"
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] text-neutral-500 block mb-1">Descrição</label>
          <input
            type="text"
            required={type !== 'transfer'}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              type === 'transfer'
                ? 'Ex: Transferência entre contas'
                : type === 'income'
                ? 'Ex: Salário, Freelance, Reembolso...'
                : 'Ex: Supermercado, Restaurante, Uber...'
            }
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900"
          />
        </div>

        {/* Transferência entre Contas */}
        {type === 'transfer' ? (
          <div className="grid grid-cols-2 gap-2.5 p-3.5 rounded-2xl bg-[#F6F5F2]">
            <div>
              <label className="text-[11px] text-neutral-500 block mb-1">Saiu da conta</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white text-xs font-semibold text-neutral-900"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-neutral-500 block mb-1">Entrou na conta</label>
              <select
                value={toAccountId}
                onChange={(e) => setToAccountId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white text-xs font-semibold text-neutral-900"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {type !== 'investment' ? (
              <div>
                <label className="text-[11px] text-neutral-500 block mb-1">Categoria</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F6F5F2] text-xs font-medium text-neutral-900"
                >
                  {filteredCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="text-[11px] text-neutral-500 block mb-1">Vincular à meta</label>
                <select
                  value={goalId}
                  onChange={(e) => setGoalId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900"
                >
                  <option value="">Sem meta específica</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-[11px] text-neutral-500 block mb-1">Conta</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#F6F5F2] text-xs font-medium text-neutral-900"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {type !== 'transfer' && (
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] text-neutral-500 block mb-1">
                Forma de pagamento
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#F6F5F2] text-xs font-medium text-neutral-900"
              >
                <option value="pix">Pix</option>
                <option value="credit">Cartão de Crédito</option>
                <option value="debit">Cartão de Débito</option>
                <option value="cash">Dinheiro</option>
                <option value="boleto">Boleto</option>
                <option value="transfer">Transferência</option>
              </select>
            </div>

            {!editingTx && type === 'expense' && paymentMethod === 'credit' ? (
              <div>
                <label className="text-[11px] text-neutral-500 block mb-1">
                  Parcelamento
                </label>
                <select
                  value={installments}
                  onChange={(e) => setInstallments(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F6F5F2] text-xs font-semibold text-neutral-900 tabular-nums"
                >
                  {[1, 2, 3, 4, 5, 6, 8, 10, 12, 18, 24].map((n) => (
                    <option key={n} value={n}>
                      {n === 1
                        ? '1x à vista'
                        : `${n}x de ${
                            numericAmount > 0
                              ? formatBRL(numericAmount / n)
                              : 'R$ ...'
                          }`}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="text-[11px] text-neutral-500 block mb-1">Situação</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TxStatus)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F6F5F2] text-xs font-medium text-neutral-900"
                >
                  <option value="paid">
                    {type === 'income' ? 'Já recebido' : 'Já pago'}
                  </option>
                  <option value="pending">
                    {type === 'income' ? 'A receber (previsto)' : 'A pagar (pendente)'}
                  </option>
                </select>
              </div>
            )}
          </div>
        )}

        {/* Revelação Progressiva: Tags e Observações sob demanda */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="text-[11px] font-semibold text-neutral-500 hover:text-neutral-900 flex items-center gap-1 py-1"
          >
            {showAdvanced ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" /> Ocultar tags e observações
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" /> Adicionar tags ou observação
              </>
            )}
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-2 gap-2.5 pt-2 animate-view">
              <div>
                <label className="text-[11px] text-neutral-500 block mb-1">
                  Tags (separadas por vírgula)
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="Ex: trabalho, viagem"
                  className="w-full px-3 py-2 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900"
                />
              </div>
              <div>
                <label className="text-[11px] text-neutral-500 block mb-1">
                  Observações
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Nota opcional..."
                  className="w-full px-3 py-2 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900"
                />
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          className="w-full py-3.5 rounded-full bg-neutral-950 text-white font-semibold text-xs active:scale-[0.99] transition"
        >
          {editingTx
            ? 'Salvar alterações'
            : installments > 1 && type === 'expense' && paymentMethod === 'credit'
            ? `Confirmar parcelamento em ${installments}x`
            : 'Confirmar lançamento'}
        </button>
      </form>
    </div>
  );
};
