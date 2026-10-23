import React, { useMemo, useState } from 'react';
import {
  Briefcase,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Edit2,
  FileText,
  Minus,
  Palmtree,
  Plus,
  Sparkles,
  Trash2,
  Umbrella,
  UserX,
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
  SeveranceReason,
  simulateSeverance,
  simulateThirteenthSalary,
  simulateVacations,
} from '../services/payrollService';
import { monthLabel } from '../utils/date';
import { formatBRL, parseMoney, toInputMoney } from '../utils/format';
import { haptic } from '../services/hapticService';

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
  // Aba principal do modal: 'holerite' | 'ferias' | 'decimo' | 'rescisao'
  const [activeTab, setActiveTab] = useState<'holerite' | 'ferias' | 'decimo' | 'rescisao'>('holerite');

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

  // Adicionar ajuste exclusivo deste mês
  const [showAddAdjustment, setShowAddAdjustment] = useState(false);
  const [adjName, setAdjName] = useState('');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjType, setAdjType] = useState<'earning' | 'deduction'>('earning');

  // Estados dos Simuladores Avançados
  // 1. Férias
  const [vacationDays, setVacationDays] = useState<number>(30);
  const [sell10Days, setSell10Days] = useState<boolean>(false);

  // 2. 13º Salário
  const [thirteenthMonths, setThirteenthMonths] = useState<number>(12);

  // 3. Rescisão
  const [severanceReason, setSeveranceReason] = useState<SeveranceReason>('dismissal_without_cause');
  const [severanceYears, setSeveranceYears] = useState<number>(2);
  const [severanceMonths, setSeveranceMonths] = useState<number>(8);
  const [hasAccruedVacation, setHasAccruedVacation] = useState<boolean>(false);
  const [noticeIndemnified, setNoticeIndemnified] = useState<boolean>(true);

  const [savedSuccess, setSavedSuccess] = useState(false);

  // Cálculos dinâmicos em tempo real
  const currentCalc = useMemo(
    () => calculatePayrollMonth(payroll, selectedYm),
    [payroll, selectedYm]
  );

  const currentGross = payroll.grossSalary > 0 ? payroll.grossSalary : parseMoney(grossInput);

  const vacationSim = useMemo(
    () => simulateVacations(currentGross, vacationDays, sell10Days),
    [currentGross, vacationDays, sell10Days]
  );

  const thirteenthSim = useMemo(
    () => simulateThirteenthSalary(currentGross, thirteenthMonths),
    [currentGross, thirteenthMonths]
  );

  const severanceSim = useMemo(
    () =>
      simulateSeverance(currentGross, severanceReason, {
        totalYearsEmployed: severanceYears,
        monthsWorkedInYear: severanceMonths,
        hasAccruedVacation,
        noticeIndemnified,
      }),
    [currentGross, severanceReason, severanceYears, severanceMonths, hasAccruedVacation, noticeIndemnified]
  );

  if (!isOpen) return null;

  const triggerSuccess = () => {
    haptic.success();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

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
    const nextAdjustments = {
      ...(payroll.monthlyAdjustments || {}),
      [selectedYm]: currentMonthly.filter((a) => a.id !== id),
    };

    onUpdatePayroll({
      ...payroll,
      monthlyAdjustments: nextAdjustments,
    });
    triggerSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-[#FFFFFF] rounded-3xl w-full max-w-md p-5 shadow-2xl flex flex-col max-h-[92vh] overflow-y-auto animate-view">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#051C22] text-[#5EEAB4] flex items-center justify-center shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-950 flex items-center gap-1.5">
                Central CLT & Holerite <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              </h3>
              <p className="text-[11px] text-neutral-500">
                {payroll.employerName || 'Empregador'} · {monthLabel(selectedYm)}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              haptic.tap();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-neutral-100 text-neutral-600 flex items-center justify-center hover:bg-neutral-200 active:scale-95 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notificação de sucesso */}
        {savedSuccess && (
          <div className="mt-3 p-2.5 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-2xl text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>Valores e regras recalculados com sucesso!</span>
          </div>
        )}

        {/* Seletor de Módulos CLT em Pílulas */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-[#F6F5F2] rounded-2xl my-3.5">
          <button
            onClick={() => {
              haptic.selection();
              setActiveTab('holerite');
            }}
            className={`py-2 text-[11px] font-semibold rounded-xl flex flex-col items-center gap-0.5 transition ${
              activeTab === 'holerite'
                ? 'bg-neutral-950 text-white shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Holerite
          </button>
          <button
            onClick={() => {
              haptic.selection();
              setActiveTab('ferias');
            }}
            className={`py-2 text-[11px] font-semibold rounded-xl flex flex-col items-center gap-0.5 transition ${
              activeTab === 'ferias'
                ? 'bg-neutral-950 text-white shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <Palmtree className="w-3.5 h-3.5 text-amber-400" />
            Férias
          </button>
          <button
            onClick={() => {
              haptic.selection();
              setActiveTab('decimo');
            }}
            className={`py-2 text-[11px] font-semibold rounded-xl flex flex-col items-center gap-0.5 transition ${
              activeTab === 'decimo'
                ? 'bg-neutral-950 text-white shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-emerald-400" />
            13º Salário
          </button>
          <button
            onClick={() => {
              haptic.selection();
              setActiveTab('rescisao');
            }}
            className={`py-2 text-[11px] font-semibold rounded-xl flex flex-col items-center gap-0.5 transition ${
              activeTab === 'rescisao'
                ? 'bg-neutral-950 text-white shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <UserX className="w-3.5 h-3.5 text-red-400" />
            Rescisão
          </button>
        </div>

        {/* ======================================================== */}
        {/* 1. MÓDULO HOLERITE MENSAL */}
        {/* ======================================================== */}
        {activeTab === 'holerite' && (
          <div className="space-y-4">
            {/* Card Principal: Salário Líquido Calculado */}
            <div className="p-4 rounded-3xl bg-gradient-to-br from-[#0F3D3E] to-[#051C22] text-white space-y-3 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-widest text-[#5EEAB4]">
                    Líquido Calculado ({monthLabel(selectedYm)})
                  </span>
                  <h2 className="text-2xl font-black tabular-nums mt-0.5 text-white">
                    {formatBRL(currentCalc.netSalary)}
                  </h2>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-neutral-300 block">Crédito Previsto:</span>
                  <span className="text-xs font-bold text-white tabular-nums">
                    {currentCalc.payDate.split('-').reverse().join('/')}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10 text-xs tabular-nums">
                <div>
                  <span className="text-[10px] text-neutral-400 block">Bruto</span>
                  <span className="font-semibold text-white">
                    {formatBRL(currentCalc.grossSalary)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-400 block">Adicionais</span>
                  <span className="font-semibold text-[#5EEAB4]">
                    +{formatBRL(currentCalc.monthlyEarningsSum)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-400 block">Descontos</span>
                  <span className="font-semibold text-rose-300">
                    -{formatBRL(currentCalc.totalDeductions)}
                  </span>
                </div>
              </div>
            </div>

            {/* Salário Bruto Base com Edição Rápida */}
            <section className="editorial-card rounded-3xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-900">Salário Bruto Contratual</span>
                {!editingGross ? (
                  <button
                    onClick={() => setEditingGross(true)}
                    className="text-xs text-neutral-500 hover:text-neutral-950 font-semibold flex items-center gap-1"
                  >
                    <Edit2 className="w-3 h-3" /> Alterar
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleSaveGross}
                      className="px-2.5 py-1 bg-neutral-950 text-white rounded-lg text-xs font-semibold"
                    >
                      Salvar
                    </button>
                    <button
                      onClick={() => setEditingGross(false)}
                      className="px-2 py-1 bg-neutral-100 text-neutral-600 rounded-lg text-xs"
                    >
                      X
                    </button>
                  </div>
                )}
              </div>

              {editingGross ? (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs font-bold text-neutral-400">R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={grossInput}
                    onChange={(e) => setGrossInput(e.target.value)}
                    placeholder="0,00"
                    className="w-full px-3 py-2 rounded-xl bg-[#F6F5F2] text-sm font-bold tabular-nums"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-lg font-extrabold text-neutral-950 tabular-nums">
                    {formatBRL(payroll.grossSalary)}
                  </span>
                  <button
                    onClick={handleAutoCalculateTaxes}
                    className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold active:scale-95 transition"
                  >
                    ⚡ Recalcular INSS/IRRF
                  </button>
                </div>
              )}
            </section>

            {/* Descontos Fixos Oficiais */}
            <section className="editorial-card rounded-3xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-neutral-900">Descontos Fixos em Folha</h4>
                  <p className="text-[10px] text-neutral-400">
                    INSS progressivo, IRRF retido, plano de saúde, etc.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddDeduction(!showAddDeduction)}
                  className="px-2.5 py-1 rounded-xl bg-neutral-100 text-neutral-700 text-xs font-semibold flex items-center gap-1 hover:bg-neutral-200"
                >
                  <Plus className="w-3 h-3" /> Desconto
                </button>
              </div>

              {showAddDeduction && (
                <form
                  onSubmit={handleAddDeduction}
                  className="p-3 bg-[#F6F5F2] rounded-2xl space-y-2 border border-neutral-200/80"
                >
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Nome do desconto"
                      value={newDedName}
                      onChange={(e) => setNewDedName(e.target.value)}
                      className="px-2.5 py-1.5 rounded-xl bg-white text-xs"
                      required
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Valor (R$)"
                      value={newDedAmount}
                      onChange={(e) => setNewDedAmount(e.target.value)}
                      className="px-2.5 py-1.5 rounded-xl bg-white text-xs font-bold tabular-nums"
                      required
                    />
                  </div>
                  <div className="flex justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddDeduction(false)}
                      className="px-2.5 py-1 rounded-xl bg-neutral-200 text-neutral-700 text-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1 rounded-xl bg-neutral-950 text-white text-xs font-semibold"
                    >
                      Adicionar
                    </button>
                  </div>
                </form>
              )}

              <div className="divide-y divide-neutral-100 text-xs tabular-nums">
                {payroll.deductions.map((d) => (
                  <div key={d.id} className="py-2 flex items-center justify-between">
                    <div>
                      <span className="font-medium text-neutral-800">{d.name}</span>
                      {d.code && (
                        <span className="text-[10px] text-neutral-400 block">Cód: {d.code}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-rose-600">-{formatBRL(d.amount)}</span>
                      <button
                        onClick={() => handleDeleteDeduction(d.id)}
                        className="text-neutral-300 hover:text-red-600 p-0.5"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Ajustes Exclusivos do Mês */}
            <section className="editorial-card rounded-3xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-neutral-900">
                    Ajustes de {monthLabel(selectedYm)}
                  </h4>
                  <p className="text-[10px] text-neutral-400">
                    Horas extras, comissões, bônus ou faltas
                  </p>
                </div>
                <button
                  onClick={() => setShowAddAdjustment(!showAddAdjustment)}
                  className="px-2.5 py-1 rounded-xl bg-neutral-100 text-neutral-700 text-xs font-semibold flex items-center gap-1 hover:bg-neutral-200"
                >
                  <Plus className="w-3 h-3" /> Ajuste
                </button>
              </div>

              {showAddAdjustment && (
                <form
                  onSubmit={handleAddMonthlyAdjustment}
                  className="p-3 bg-[#F6F5F2] rounded-2xl space-y-2 border border-neutral-200/80"
                >
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAdjType('earning')}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-semibold ${
                        adjType === 'earning'
                          ? 'bg-emerald-700 text-white'
                          : 'bg-white text-neutral-600'
                      }`}
                    >
                      + Provento / Extra
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjType('deduction')}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-semibold ${
                        adjType === 'deduction'
                          ? 'bg-red-700 text-white'
                          : 'bg-white text-neutral-600'
                      }`}
                    >
                      - Desconto Variável
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Ex: 10h Extras 50%"
                      value={adjName}
                      onChange={(e) => setAdjName(e.target.value)}
                      className="px-2.5 py-1.5 rounded-xl bg-white text-xs"
                      required
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Valor (R$)"
                      value={adjAmount}
                      onChange={(e) => setAdjAmount(e.target.value)}
                      className="px-2.5 py-1.5 rounded-xl bg-white text-xs font-bold tabular-nums"
                      required
                    />
                  </div>
                  <div className="flex justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddAdjustment(false)}
                      className="px-2.5 py-1 rounded-xl bg-neutral-200 text-neutral-700 text-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1 rounded-xl bg-neutral-950 text-white text-xs font-semibold"
                    >
                      Salvar Ajuste
                    </button>
                  </div>
                </form>
              )}

              {currentCalc.adjustments.length > 0 && (
                <div className="divide-y divide-neutral-100 text-xs tabular-nums">
                  {currentCalc.adjustments.map((adj) => (
                    <div key={adj.id} className="py-1.5 flex items-center justify-between">
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
            </section>
          </div>
        )}

        {/* ======================================================== */}
        {/* 2. MÓDULO SIMULADOR DE FÉRIAS CLT */}
        {/* ======================================================== */}
        {activeTab === 'ferias' && (
          <div className="space-y-4">
            <div className="p-4 rounded-3xl bg-gradient-to-br from-amber-900 to-neutral-950 text-white space-y-2 shadow-lg">
              <span className="text-[10px] uppercase font-bold tracking-widest text-amber-300">
                Líquido Total das Férias no Bolso
              </span>
              <h2 className="text-2xl font-black tabular-nums text-white">
                {formatBRL(vacationSim.totalTakeHomePay)}
              </h2>
              <p className="text-[11px] text-amber-200/80 leading-relaxed">
                Deve ser pago obrigatoriamente pelo empregador até 2 dias antes do início do descanso (Art. 145 CLT).
              </p>
            </div>

            {/* Controles de Simulação */}
            <section className="editorial-card rounded-3xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-neutral-900">Configuração das Férias</h4>
              
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    haptic.tap();
                    setVacationDays(30);
                    setSell10Days(false);
                  }}
                  className={`p-3 rounded-2xl border text-left transition ${
                    !sell10Days && vacationDays === 30
                      ? 'border-neutral-950 bg-[#F6F5F2]'
                      : 'border-neutral-200 bg-white'
                  }`}
                >
                  <span className="text-xs font-bold block text-neutral-900">30 Dias Corridos</span>
                  <span className="text-[10px] text-neutral-500">Gozo integral sem venda</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    haptic.tap();
                    setVacationDays(20);
                    setSell10Days(true);
                  }}
                  className={`p-3 rounded-2xl border text-left transition ${
                    sell10Days
                      ? 'border-amber-600 bg-amber-50/50'
                      : 'border-neutral-200 bg-white'
                  }`}
                >
                  <span className="text-xs font-bold block text-amber-900">Vender 10 Dias</span>
                  <span className="text-[10px] text-amber-700">Abono 100% Isento de IR/INSS</span>
                </button>
              </div>
            </section>

            {/* Detalhamento dos Cálculos */}
            <section className="editorial-card rounded-3xl p-4 space-y-2 text-xs tabular-nums">
              <h4 className="text-xs font-bold text-neutral-900 mb-2">Composição Financeira</h4>
              
              <div className="flex justify-between py-1 border-b border-neutral-100">
                <span className="text-neutral-600">Salário dos {vacationSim.vacationDays} dias</span>
                <span className="font-semibold text-neutral-900">{formatBRL(vacationSim.salaryVacationDays)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100">
                <span className="text-neutral-600">1/3 Constitucional</span>
                <span className="font-semibold text-neutral-900">+{formatBRL(vacationSim.oneThirdConstitutional)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100 text-rose-600">
                <span>INSS s/ férias</span>
                <span className="font-semibold">-{formatBRL(vacationSim.inssDiscount)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100 text-rose-600">
                <span>IRRF s/ férias</span>
                <span className="font-semibold">-{formatBRL(vacationSim.irrfDiscount)}</span>
              </div>

              {sell10Days && (
                <div className="pt-2 bg-amber-50/60 p-2.5 rounded-xl border border-amber-200/60 space-y-1">
                  <div className="flex justify-between text-amber-950 font-bold">
                    <span>Abono Pecuniário (10 dias + 1/3)</span>
                    <span>+{formatBRL(vacationSim.allowanceTotalTaxFree)}</span>
                  </div>
                  <p className="text-[10px] text-amber-700">
                    Isento por lei de INSS e IRRF (aumento líquido de capital).
                  </p>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ======================================================== */}
        {/* 3. MÓDULO SIMULADOR DE 13º SALÁRIO */}
        {/* ======================================================== */}
        {activeTab === 'decimo' && (
          <div className="space-y-4">
            <div className="p-4 rounded-3xl bg-gradient-to-br from-emerald-950 to-neutral-950 text-white space-y-2 shadow-lg">
              <span className="text-[10px] uppercase font-bold tracking-widest text-[#5EEAB4]">
                13º Salário Líquido Total ({thirteenthSim.monthsWorked}/12 avos)
              </span>
              <h2 className="text-2xl font-black tabular-nums text-white">
                {formatBRL(thirteenthSim.totalNetReceived)}
              </h2>
              <p className="text-[11px] text-emerald-200/80">
                Pago obrigatoriamente em 2 parcelas pelo empregador.
              </p>
            </div>

            <section className="editorial-card rounded-3xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-neutral-900">
                <span>Meses Trabalhados no Ano</span>
                <span className="tabular-nums">{thirteenthMonths} meses</span>
              </div>
              <input
                type="range"
                min="1"
                max="12"
                value={thirteenthMonths}
                onChange={(e) => {
                  haptic.selection();
                  setThirteenthMonths(Number(e.target.value));
                }}
                className="w-full accent-neutral-950"
              />
            </section>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3.5 rounded-2xl bg-[#F6F5F2] border border-neutral-200/70 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">
                  1ª Parcela (Até 30/Nov)
                </span>
                <span className="text-base font-extrabold text-neutral-950 tabular-nums block">
                  {formatBRL(thirteenthSim.firstInstallment)}
                </span>
                <span className="text-[10px] text-emerald-700 font-semibold block">
                  100% Bruto · Sem descontos
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#F6F5F2] border border-neutral-200/70 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">
                  2ª Parcela (Até 20/Dez)
                </span>
                <span className="text-base font-extrabold text-neutral-950 tabular-nums block">
                  {formatBRL(thirteenthSim.secondInstallmentNet)}
                </span>
                <span className="text-[10px] text-rose-600 font-semibold block">
                  Com deduções de INSS e IRRF
                </span>
              </div>
            </div>

            <section className="editorial-card rounded-3xl p-3.5 space-y-1.5 text-xs tabular-nums text-neutral-600">
              <div className="flex justify-between">
                <span>Total Bruto Proporcional</span>
                <span className="font-semibold text-neutral-900">{formatBRL(thirteenthSim.proportionalGross)}</span>
              </div>
              <div className="flex justify-between text-rose-600">
                <span>Total INSS (exclusivo em fonte)</span>
                <span className="font-semibold">-{formatBRL(thirteenthSim.totalInss)}</span>
              </div>
              <div className="flex justify-between text-rose-600">
                <span>Total IRRF (tributação definitiva)</span>
                <span className="font-semibold">-{formatBRL(thirteenthSim.totalIrrf)}</span>
              </div>
            </section>
          </div>
        )}

        {/* ======================================================== */}
        {/* 4. MÓDULO SIMULADOR DE RESCISÃO TRABALHISTA CLT */}
        {/* ======================================================== */}
        {activeTab === 'rescisao' && (
          <div className="space-y-4">
            <div className="p-4 rounded-3xl bg-gradient-to-br from-neutral-900 to-black text-white space-y-2 shadow-lg">
              <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-400">
                Impacto Financeiro Global (Rescisão + FGTS)
              </span>
              <h2 className="text-2xl font-black tabular-nums text-white">
                {formatBRL(severanceSim.totalWithFgtsAndFine)}
              </h2>
              <div className="flex justify-between text-[11px] pt-1 border-t border-white/10 text-neutral-300">
                <span>Pago na TRCT: {formatBRL(severanceSim.netSeveranceDirectPay)}</span>
                <span>Saque FGTS: {formatBRL(severanceSim.estimatedFgtsBalance + severanceSim.fgtsFineAmount)}</span>
              </div>
            </div>

            {/* Motivo da Rescisão */}
            <section className="editorial-card rounded-3xl p-4 space-y-2">
              <label className="text-xs font-bold text-neutral-900 block">Tipo de Demissão</label>
              <select
                value={severanceReason}
                onChange={(e) => {
                  haptic.selection();
                  setSeveranceReason(e.target.value as SeveranceReason);
                }}
                className="w-full px-3 py-2 rounded-xl bg-[#F6F5F2] text-xs font-semibold text-neutral-900"
              >
                <option value="dismissal_without_cause">Demissão sem justa causa (Multa 40% FGTS)</option>
                <option value="resignation">Pedido de demissão pelo colaborador</option>
                <option value="mutual_agreement">Acordo mútuo (Art. 484-A CLT · Multa 20%)</option>
              </select>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <div>
                  <span className="text-[10px] text-neutral-500 block">Anos na empresa:</span>
                  <input
                    type="number"
                    min="0"
                    max="40"
                    value={severanceYears}
                    onChange={(e) => setSeveranceYears(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-[#F6F5F2] text-xs font-bold tabular-nums"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-neutral-500 block">Meses no ano corrente:</span>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={severanceMonths}
                    onChange={(e) => setSeveranceMonths(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-[#F6F5F2] text-xs font-bold tabular-nums"
                  />
                </div>
              </div>

              <div className="pt-2 space-y-1.5 text-xs text-neutral-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasAccruedVacation}
                    onChange={(e) => setHasAccruedVacation(e.target.checked)}
                    className="rounded accent-neutral-950"
                  />
                  <span>Possui 1 período de férias vencidas pendente</span>
                </label>
                {severanceReason !== 'resignation' && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={noticeIndemnified}
                      onChange={(e) => setNoticeIndemnified(e.target.checked)}
                      className="rounded accent-neutral-950"
                    />
                    <span>Aviso prévio indenizado (sem cumprimento trabalhado)</span>
                  </label>
                )}
              </div>
            </section>

            {/* Verbas Rescisórias Discriminadas */}
            <section className="editorial-card rounded-3xl p-4 space-y-2 text-xs tabular-nums text-neutral-700">
              <h4 className="text-xs font-bold text-neutral-900 mb-1">Verbas Rescisórias</h4>
              <div className="flex justify-between py-0.5">
                <span>Saldo de Salário (30 dias)</span>
                <span className="font-semibold text-neutral-900">{formatBRL(severanceSim.balanceOfSalary)}</span>
              </div>
              {severanceSim.noticeIndemnified > 0 && (
                <div className="flex justify-between py-0.5">
                  <span>Aviso Prévio Indenizado</span>
                  <span className="font-semibold text-neutral-900">+{formatBRL(severanceSim.noticeIndemnified)}</span>
                </div>
              )}
              {severanceSim.vacationAccrued > 0 && (
                <div className="flex justify-between py-0.5">
                  <span>Férias Vencidas + 1/3</span>
                  <span className="font-semibold text-neutral-900">+{formatBRL(severanceSim.vacationAccrued)}</span>
                </div>
              )}
              <div className="flex justify-between py-0.5">
                <span>Férias Proporcionais ({severanceMonths}/12) + 1/3</span>
                <span className="font-semibold text-neutral-900">+{formatBRL(severanceSim.vacationProportional)}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span>13º Proporcional ({severanceMonths}/12)</span>
                <span className="font-semibold text-neutral-900">+{formatBRL(severanceSim.thirteenthProportional)}</span>
              </div>
              <div className="flex justify-between py-0.5 text-rose-600">
                <span>INSS e IRRF s/ Saldo</span>
                <span className="font-semibold">-{formatBRL(severanceSim.totalDeductions)}</span>
              </div>

              {severanceReason !== 'resignation' && (
                <div className="pt-2 border-t border-neutral-100 space-y-1">
                  <div className="flex justify-between text-emerald-800 font-semibold">
                    <span>Saldo Estimado FGTS Liberado</span>
                    <span>+{formatBRL(severanceSim.estimatedFgtsBalance)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-800 font-bold">
                    <span>Multa Rescisória ({severanceSim.fgtsFinePercent}%)</span>
                    <span>+{formatBRL(severanceSim.fgtsFineAmount)}</span>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* Botão de Fechar */}
        <div className="pt-4 border-t border-neutral-100 mt-2">
          <button
            type="button"
            onClick={() => {
              haptic.tap();
              onClose();
            }}
            className="w-full py-3.5 rounded-full bg-neutral-950 text-white font-semibold text-xs active:scale-[0.99] transition"
          >
            Concluir e fechar
          </button>
        </div>
      </div>
    </div>
  );
};
