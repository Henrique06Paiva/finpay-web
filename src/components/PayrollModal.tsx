import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit2,
  FileText,
  Minus,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  Account,
  PayrollAdjustment,
  PayrollConfig,
  PayrollDeduction,
} from '../types/finance';
import {
  calculatePayrollMonth,
  calculateProgressiveINSS,
  calculateProgressiveIRRF,
} from '../services/payrollService';
import { monthLabel } from '../utils/date';
import { formatBRL, parseMoney, toInputMoney } from '../utils/format';

interface PayrollModalProps {
  isOpen: boolean;
  selectedYm: string;
  payroll: PayrollConfig;
  accounts: Account[];
  onClose: () => void;
  onUpdatePayroll: (updated: PayrollConfig) => void;
}

export const PayrollModal: React.FC<PayrollModalProps> = ({
  isOpen,
  selectedYm,
  payroll,
  accounts,
  onClose,
  onUpdatePayroll,
}) => {
  // Estado local para edição do holerite
  const [grossInput, setGrossInput] = useState(toInputMoney(payroll.grossSalary));
  const [editingGross, setEditingGross] = useState(false);

  const [employer, setEmployer] = useState(payroll.employerName || '');
  const [role, setRole] = useState(payroll.role || '');
  const [payDayRule, setPayDayRule] = useState(payroll.payDayRule || 'last_business_day');
  const [accountId, setAccountId] = useState(payroll.accountId || accounts[0]?.id || 'principal');

  // Adicionar novo desconto fixo
  const [showAddDeduction, setShowAddDeduction] = useState(false);
  const [newDedName, setNewDedName] = useState('');
  const [newDedCode, setNewDedCode] = useState('');
  const [newDedAmount, setNewDedAmount] = useState('');

  // Adicionar ajuste exclusivo deste mês (hora extra, bônus ou desconto variável)
  const [showAddAdjustment, setShowAddAdjustment] = useState(false);
  const [adjName, setAdjName] = useState('');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjType, setAdjType] = useState<'earning' | 'deduction'>('earning');

  const [savedSuccess, setSavedSuccess] = useState(false);

  // Calcula valores em tempo real para o mês selecionado
  const currentCalc = useMemo(
    () => calculatePayrollMonth(payroll, selectedYm),
    [payroll, selectedYm]
  );

  if (!isOpen) return null;

  const handleSaveGross = () => {
    const val = parseMoney(grossInput);
    if (val > 0) {
      onUpdatePayroll({ ...payroll, enabled: true, grossSalary: val });
      setEditingGross(false);
      triggerSuccess();
    }
  };

  const handleAutoCalculateTaxes = () => {
    const gross = payroll.grossSalary > 0 ? payroll.grossSalary : parseMoney(grossInput);
    if (gross <= 0) return;

    const inssVal = calculateProgressiveINSS(gross);
    const irrfVal = calculateProgressiveIRRF(gross, inssVal);

    const others = payroll.deductions.filter(
      (d) =>
        d.id !== 'inss' &&
        d.id !== 'irrf' &&
        d.code !== '2103' &&
        d.code !== '2104' &&
        !d.name.toUpperCase().includes('INSS') &&
        !d.name.toUpperCase().includes('IRRF')
    );

    const nextDeductions: PayrollDeduction[] = [
      { id: 'inss', code: '2103', name: 'INSS Oficial (Progressivo)', amount: inssVal },
      ...(irrfVal > 0
        ? [{ id: 'irrf', code: '2104', name: 'IRRF Oficial (Progressivo)', amount: irrfVal }]
        : []),
      ...others,
    ];

    onUpdatePayroll({
      ...payroll,
      enabled: true,
      grossSalary: gross,
      deductions: nextDeductions,
    });
    setEditingGross(false);
    triggerSuccess();
  };

  const handleAddDeduction = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseMoney(newDedAmount);
    if (!newDedName.trim() || val <= 0) return;

    const newDed: PayrollDeduction = {
      id: `ded-${Date.now()}`,
      code: newDedCode.trim() || undefined,
      name: newDedName.trim(),
      amount: val,
    };

    onUpdatePayroll({
      ...payroll,
      deductions: [...payroll.deductions, newDed],
    });

    setNewDedName('');
    setNewDedCode('');
    setNewDedAmount('');
    setShowAddDeduction(false);
    triggerSuccess();
  };

  const handleDeleteDeduction = (id: string) => {
    onUpdatePayroll({
      ...payroll,
      deductions: payroll.deductions.filter((d) => d.id !== id),
    });
    triggerSuccess();
  };

  const handleAddMonthlyAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseMoney(adjAmount);
    if (!adjName.trim() || val <= 0) return;

    const newAdj: PayrollAdjustment = {
      id: `adj-${Date.now()}`,
      name: adjName.trim(),
      amount: val,
      type: adjType,
    };

    const currentMonthly = payroll.monthlyAdjustments?.[selectedYm] || [];
    const nextAdjustments = {
      ...(payroll.monthlyAdjustments || {}),
      [selectedYm]: [...currentMonthly, newAdj],
    };

    onUpdatePayroll({
      ...payroll,
      monthlyAdjustments: nextAdjustments,
    });

    setAdjName('');
    setAdjAmount('');
    setShowAddAdjustment(false);
    triggerSuccess();
  };

  const handleDeleteAdjustment = (id: string) => {
    const currentMonthly = payroll.monthlyAdjustments?.[selectedYm] || [];
    const filtered = currentMonthly.filter((a) => a.id !== id);
    const nextAdjustments = {
      ...(payroll.monthlyAdjustments || {}),
      [selectedYm]: filtered,
    };

    onUpdatePayroll({
      ...payroll,
      monthlyAdjustments: nextAdjustments,
    });
    triggerSuccess();
  };

  const triggerSuccess = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleUpdateGeneralSettings = () => {
    onUpdatePayroll({
      ...payroll,
      employerName: employer.trim() || payroll.employerName,
      role: role.trim() || payroll.role,
      payDayRule,
      accountId,
    });
    triggerSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-[#F6F5F2] text-[#111111] max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden animate-view">
        {/* Topo do Modal */}
        <div className="px-5 pt-5 pb-3.5 bg-white border-b border-neutral-200/70 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-neutral-950 text-white flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold text-neutral-950">
                  Holerite CLT Recorrente
                </h2>
                <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold">
                  Automático
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">
                {monthLabel(selectedYm)} · Último dia útil
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#F6F5F2] text-neutral-600 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo Rolável */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {savedSuccess && (
            <div className="p-3 rounded-2xl bg-emerald-900 text-white text-xs font-semibold flex items-center gap-2 animate-view">
              <CheckCircle2 className="w-4 h-4 text-emerald-300" />
              <span>Holerite atualizado e recalculado para todos os meses!</span>
            </div>
          )}

          {/* Card Principal: Salário Líquido que cai na Conta */}
          <section className="editorial-card rounded-3xl p-5 space-y-3 border-l-4 border-l-emerald-600">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                  Salário Líquido na Conta ({monthLabel(selectedYm)})
                </p>
                <h3 className="text-3xl font-bold text-emerald-700 tabular-nums mt-1">
                  {formatBRL(currentCalc.netSalary)}
                </h3>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                Cai na conta
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-neutral-500 pt-2 border-t border-neutral-100 tabular-nums">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                Data de pagamento:
              </span>
              <strong className="text-neutral-900">
                {currentCalc.payDate.split('-').reverse().join('/')} (Último dia útil)
              </strong>
            </div>
          </section>

          {/* Demonstrativo de Vencimentos & Descontos (Estilo Contracheque Oficial) */}
          <section className="editorial-card rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                  Demonstrativo de Folha
                </h4>
                <p className="text-xs text-neutral-900 font-semibold mt-0.5">
                  {payroll.employerName} · {payroll.role}
                </p>
              </div>
            </div>

            {/* 1. Salário Base / Vencimentos */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-neutral-900">
                  0004 Salário - Mensalistas (Bruto)
                </span>

                {editingGross ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      autoFocus
                      value={grossInput}
                      onChange={(e) => setGrossInput(e.target.value)}
                      className="w-24 px-2 py-1 rounded-lg bg-[#F6F5F2] text-xs font-bold tabular-nums"
                    />
                    <button
                      onClick={handleSaveGross}
                      className="p-1 rounded-lg bg-neutral-950 text-white"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setEditingGross(false)}
                      className="p-1 rounded-lg bg-neutral-100 text-neutral-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setGrossInput(toInputMoney(payroll.grossSalary));
                      setEditingGross(true);
                    }}
                    className="flex items-center gap-1 font-bold text-neutral-950 tabular-nums hover:underline"
                    title="Editar salário base (Aumento)"
                  >
                    <span>{formatBRL(payroll.grossSalary)}</span>
                    <Edit2 className="w-3 h-3 text-neutral-400" />
                  </button>
                )}
              </div>

              {payroll.grossSalary > 0 && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-neutral-500">
                    Tabela progressiva oficial CLT (INSS + IRRF)
                  </span>
                  <button
                    type="button"
                    onClick={handleAutoCalculateTaxes}
                    className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold active:scale-95 transition"
                  >
                    Calcular INSS & IRRF oficial
                  </button>
                </div>
              )}
            </div>

            {/* 2. Descontos Fixos CLT */}
            <div className="space-y-2 pt-2 border-t border-neutral-100">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                  Descontos Fixos CLT (-{formatBRL(currentCalc.fixedDeductionsSum)})
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddDeduction((prev) => !prev)}
                  className="text-[11px] font-bold text-neutral-900 flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" /> Adicionar desconto
                </button>
              </div>

              {/* Formulário Novo Desconto Fixo */}
              {showAddDeduction && (
                <form
                  onSubmit={handleAddDeduction}
                  className="p-3 rounded-2xl bg-[#F6F5F2] space-y-2 animate-view"
                >
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Cód (ex: 2075)"
                      value={newDedCode}
                      onChange={(e) => setNewDedCode(e.target.value)}
                      className="px-2.5 py-1.5 rounded-xl bg-white text-xs"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Nome do desconto"
                      value={newDedName}
                      onChange={(e) => setNewDedName(e.target.value)}
                      className="col-span-2 px-2.5 py-1.5 rounded-xl bg-white text-xs"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      required
                      placeholder="Valor (R$)"
                      value={newDedAmount}
                      onChange={(e) => setNewDedAmount(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 rounded-xl bg-white text-xs font-bold tabular-nums"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-xl bg-neutral-950 text-white text-xs font-semibold"
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddDeduction(false)}
                      className="px-2.5 py-1.5 rounded-xl bg-neutral-200 text-neutral-700 text-xs"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}

              <div className="divide-y divide-neutral-100 text-xs tabular-nums">
                {payroll.deductions.map((ded) => (
                  <div
                    key={ded.id}
                    className="py-2 first:pt-1 last:pb-1 flex items-center justify-between"
                  >
                    <div>
                      <span className="text-neutral-700">
                        {ded.code ? `${ded.code} ` : ''}
                        {ded.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-red-600">
                        -{formatBRL(ded.amount)}
                      </span>
                      <button
                        onClick={() => handleDeleteDeduction(ded.id)}
                        className="text-neutral-300 hover:text-red-600 p-0.5"
                        title="Remover desconto"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Ajustes Específicos Deste Mês (Extras ou Descontos Esporádicos) */}
            <div className="space-y-2 pt-2 border-t border-neutral-100">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                    Ajustes de {monthLabel(selectedYm)}
                  </span>
                  <p className="text-[10px] text-neutral-400">
                    Horas extras, bônus ou descontos exclusivos deste mês
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddAdjustment((prev) => !prev)}
                  className="px-2.5 py-1 rounded-full bg-[#F6F5F2] hover:bg-neutral-200 text-[11px] font-bold text-neutral-900 flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" /> Ajuste no mês
                </button>
              </div>

              {/* Formulário Novo Ajuste no Mês */}
              {showAddAdjustment && (
                <form
                  onSubmit={handleAddMonthlyAdjustment}
                  className="p-3 rounded-2xl bg-[#F6F5F2] space-y-2 animate-view"
                >
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAdjType('earning')}
                      className={`py-1.5 rounded-xl text-xs font-semibold ${
                        adjType === 'earning'
                          ? 'bg-emerald-700 text-white'
                          : 'bg-white text-neutral-700'
                      }`}
                    >
                      + Extra / Bônus (+)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjType('deduction')}
                      className={`py-1.5 rounded-xl text-xs font-semibold ${
                        adjType === 'deduction'
                          ? 'bg-red-700 text-white'
                          : 'bg-white text-neutral-700'
                      }`}
                    >
                      - Desconto (-)
                    </button>
                  </div>

                  <input
                    type="text"
                    required
                    placeholder="Descrição (ex: Horas Extras, Bônus, Atraso...)"
                    value={adjName}
                    onChange={(e) => setAdjName(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-white text-xs"
                  />

                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      required
                      placeholder="Valor (R$)"
                      value={adjAmount}
                      onChange={(e) => setAdjAmount(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 rounded-xl bg-white text-xs font-bold tabular-nums"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-xl bg-neutral-950 text-white text-xs font-semibold"
                    >
                      Salvar ajuste
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddAdjustment(false)}
                      className="px-2.5 py-1.5 rounded-xl bg-neutral-200 text-neutral-700 text-xs"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}

              {currentCalc.adjustments.length > 0 && (
                <div className="divide-y divide-neutral-100 text-xs tabular-nums">
                  {currentCalc.adjustments.map((adj) => (
                    <div
                      key={adj.id}
                      className="py-1.5 flex items-center justify-between"
                    >
                      <span className="text-neutral-700">{adj.name}</span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-semibold ${
                            adj.type === 'earning' ? 'text-emerald-700' : 'text-red-600'
                          }`}
                        >
                          {adj.type === 'earning' ? '+' : '-'} {formatBRL(adj.amount)}
                        </span>
                        <button
                          onClick={() => handleDeleteAdjustment(adj.id)}
                          className="text-neutral-300 hover:text-red-600 p-0.5"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Configurações de Regra e Conta de Destino */}
          <section className="editorial-card rounded-3xl p-5 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Regra de Pagamento & Conta
            </h4>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] text-neutral-500 block mb-1">
                  Dia do crédito
                </label>
                <select
                  value={payDayRule}
                  onChange={(e) => {
                    setPayDayRule(e.target.value as 'last_business_day' | 'last_day' | 'fifth_business_day');
                    onUpdatePayroll({
                      ...payroll,
                      payDayRule: e.target.value as 'last_business_day' | 'last_day' | 'fifth_business_day',
                    });
                    triggerSuccess();
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-[#F6F5F2] text-xs font-semibold text-neutral-900"
                >
                  <option value="last_business_day">Último dia útil</option>
                  <option value="last_day">Último dia do mês</option>
                  <option value="fifth_business_day">5º dia útil</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-neutral-500 block mb-1">
                  Conta de recebimento
                </label>
                <select
                  value={accountId}
                  onChange={(e) => {
                    setAccountId(e.target.value);
                    onUpdatePayroll({
                      ...payroll,
                      accountId: e.target.value,
                    });
                    triggerSuccess();
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-[#F6F5F2] text-xs font-semibold text-neutral-900"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-3.5 rounded-full bg-neutral-950 text-white font-semibold text-xs active:scale-[0.99] transition"
          >
            Concluir e fechar
          </button>
        </div>
      </div>
    </div>
  );
};
