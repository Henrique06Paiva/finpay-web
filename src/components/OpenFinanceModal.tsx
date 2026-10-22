import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  Account,
  Category,
  OpenFinanceConsent,
  OpenFinanceScope,
  Transaction,
} from '../types/finance';
import {
  OPEN_FINANCE_INSTITUTIONS,
  OPEN_FINANCE_SCOPE_INFO,
  ParsedBankTransaction,
  parseCsvStatement,
  parseOfxStatement,
} from '../services/openFinanceService';
import { addMonths, todayISO } from '../utils/date';
import { formatBRL } from '../utils/format';

interface OpenFinanceModalProps {
  isOpen: boolean;
  accounts: Account[];
  categories: Category[];
  existingTransactions: Transaction[];
  consents: OpenFinanceConsent[];
  onClose: () => void;
  onCreateConsent: (
    consent: Omit<OpenFinanceConsent, 'id' | 'importedCount'>,
    newAccountIfNeeded?: { name: string; color: string }
  ) => string; // retorna o accountId vinculado
  onRevokeConsent: (consentId: string) => void;
  onImportTransactions: (
    consentId: string | undefined,
    accountId: string,
    items: ParsedBankTransaction[]
  ) => void;
}

export const OpenFinanceModal: React.FC<OpenFinanceModalProps> = ({
  isOpen,
  accounts,
  categories,
  existingTransactions,
  consents,
  onClose,
  onCreateConsent,
  onRevokeConsent,
  onImportTransactions,
}) => {
  const [step, setStep] = useState<'hub' | 'new_consent' | 'sync_file' | 'review'>('hub');
  const [activeConsentId, setActiveConsentId] = useState<string | undefined>(
    consents.find((c) => c.status === 'ACTIVE')?.id
  );

  // Novo Consentimento Open Finance
  const [selectedInstId, setSelectedInstId] = useState<string>('nubank');
  const [selectedScopes, setSelectedScopes] = useState<OpenFinanceScope[]>([
    'ACCOUNTS_READ',
    'BALANCES_READ',
    'TRANSACTIONS_READ',
    'CREDIT_CARDS_READ',
  ]);
  const [validityMonths, setValidityMonths] = useState<3 | 6 | 12>(12);
  const [targetAccountId, setTargetAccountId] = useState<string>('__new__');
  const [lgpdAccepted, setLgpdAccepted] = useState<boolean>(true);

  // Sincronização de Arquivo (OFX / CSV)
  const [isCreditCardCsv, setIsCreditCardCsv] = useState<boolean>(false);
  const [parsedItems, setParsedItems] = useState<ParsedBankTransaction[]>([]);
  const [sourceFormat, setSourceFormat] = useState<'OFX' | 'CSV' | 'API'>('OFX');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importSuccessCount, setImportSuccessCount] = useState<number | null>(null);

  const activeConsents = useMemo(
    () => consents.filter((c) => c.status === 'ACTIVE'),
    [consents]
  );

  const selectedInstitution = useMemo(
    () =>
      OPEN_FINANCE_INSTITUTIONS.find((i) => i.id === selectedInstId) ||
      OPEN_FINANCE_INSTITUTIONS[0],
    [selectedInstId]
  );

  const currentConsent = useMemo(
    () => consents.find((c) => c.id === activeConsentId),
    [consents, activeConsentId]
  );

  if (!isOpen) return null;

  const toggleScope = (scope: OpenFinanceScope) => {
    if (OPEN_FINANCE_SCOPE_INFO[scope].mandatory) return;
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleConfirmConsent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lgpdAccepted) return;

    const nowIso = todayISO();
    const expIso = addMonths(nowIso, validityMonths);

    const createNewAcc =
      targetAccountId === '__new__'
        ? {
            name: selectedInstitution.shortName,
            color: selectedInstitution.color,
          }
        : undefined;

    const resolvedAccId = onCreateConsent(
      {
        institutionId: selectedInstitution.id,
        institutionName: selectedInstitution.name,
        institutionColor: selectedInstitution.color,
        accountId: targetAccountId === '__new__' ? '' : targetAccountId,
        scopes: selectedScopes,
        status: 'ACTIVE',
        validityMonths,
        createdAt: nowIso,
        expiresAt: expIso,
        lastSyncAt: nowIso,
      },
      createNewAcc
    );

    setTargetAccountId(resolvedAccId);
    setStep('sync_file');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);

    try {
      const text = await file.text();
      const lower = file.name.toLowerCase();
      const isOfx =
        lower.endsWith('.ofx') ||
        lower.endsWith('.qfx') ||
        text.includes('<OFX>') ||
        text.includes('<STMTTRN>');

      const parsed = isOfx
        ? parseOfxStatement(text, existingTransactions)
        : parseCsvStatement(text, existingTransactions, isCreditCardCsv);

      if (parsed.transactions.length === 0) {
        setErrorMsg(
          'Nenhuma movimentação válida foi encontrada neste arquivo. Verifique se o extrato está em formato OFX ou CSV.'
        );
      } else {
        setParsedItems(parsed.transactions);
        setSourceFormat(parsed.sourceFormat);
        setStep('review');
      }
    } catch {
      setErrorMsg('Não foi possível ler o arquivo selecionado.');
    }
    e.target.value = '';
  };

  const handleConfirmImport = () => {
    const selectedToImport = parsedItems.filter((i) => i.selected);
    if (selectedToImport.length === 0) return;

    const accId =
      currentConsent?.accountId ||
      (targetAccountId !== '__new__' ? targetAccountId : accounts[0]?.id || 'principal');

    onImportTransactions(currentConsent?.id, accId, selectedToImport);
    setImportSuccessCount(selectedToImport.length);
    setParsedItems([]);
    setTimeout(() => {
      setImportSuccessCount(null);
      setStep('hub');
    }, 1800);
  };

  const selectedCount = parsedItems.filter((i) => i.selected).length;
  const duplicateCount = parsedItems.filter((i) => i.isDuplicate).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-[#F6F5F2] text-[#111111] max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden animate-view">
        {/* Topo Fixo do Modal */}
        <div className="px-5 pt-5 pb-3.5 bg-white border-b border-neutral-200/70 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-neutral-950 text-white flex items-center justify-center flex-shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold text-neutral-950">
                  Open Finance Brasil
                </h2>
                <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold uppercase">
                  Consentimento Ativo
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">
                Importação segura com categorização automática
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

        {/* Navegação Interna Mobile */}
        <div className="px-5 py-2.5 bg-white border-b border-neutral-100 flex gap-1.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setStep('hub')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 transition ${
              step === 'hub'
                ? 'bg-neutral-950 text-white'
                : 'bg-[#F6F5F2] text-neutral-600'
            }`}
          >
            Bancos Conectados ({activeConsents.length})
          </button>
          <button
            onClick={() => setStep('new_consent')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 transition ${
              step === 'new_consent'
                ? 'bg-neutral-950 text-white'
                : 'bg-[#F6F5F2] text-neutral-600'
            }`}
          >
            + Novo Consentimento
          </button>
          <button
            onClick={() => setStep('sync_file')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 transition ${
              step === 'sync_file' || step === 'review'
                ? 'bg-neutral-950 text-white'
                : 'bg-[#F6F5F2] text-neutral-600'
            }`}
          >
            Importar OFX / CSV
          </button>
        </div>

        {/* Corpo Rolável */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {importSuccessCount !== null && (
            <div className="p-4 rounded-2xl bg-emerald-900 text-white text-xs font-semibold flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-300 flex-shrink-0" />
              <span>
                {importSuccessCount} lançamento(s) importado(s) e categorizado(s) com sucesso!
              </span>
            </div>
          )}

          {/* ==================== ETAPA 1: HUB DE CONSENTIMENTOS ==================== */}
          {step === 'hub' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white border border-neutral-200/80 space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <h3 className="text-xs font-bold text-neutral-950">
                    Controle total dos seus dados (LGPD)
                  </h3>
                </div>
                <p className="text-[11px] text-neutral-500 leading-relaxed">
                  Você escolhe quais instituições autorizar, revisa cada transação antes de confirmar e pode revogar o consentimento a qualquer momento com 1 toque.
                </p>
              </div>

              {activeConsents.length === 0 ? (
                <div className="editorial-card rounded-3xl p-6 text-center space-y-3">
                  <p className="text-sm font-bold text-neutral-950">
                    Nenhuma instituição conectada ainda
                  </p>
                  <p className="text-xs text-neutral-500 leading-relaxed">
                    Autorize seu banco (Nubank, Itaú, Inter, Bradesco, BTG, Santander, C6 ou BB) para sincronizar extratos e faturas sem digitar manualmente.
                  </p>
                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      onClick={() => setStep('new_consent')}
                      className="w-full py-3 rounded-full bg-neutral-950 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" /> Conectar instituição com consentimento
                    </button>
                    <button
                      onClick={() => setStep('sync_file')}
                      className="w-full py-2.5 rounded-full bg-[#F6F5F2] text-neutral-800 text-xs font-semibold"
                    >
                      Importar arquivo OFX / CSV direto
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeConsents.map((consent) => {
                    const acc = accounts.find((a) => a.id === consent.accountId);
                    return (
                      <div
                        key={consent.id}
                        className="editorial-card rounded-3xl p-4 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="w-9 h-9 rounded-2xl text-white font-bold text-xs flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: consent.institutionColor }}
                            >
                              {consent.institutionName.slice(0, 2).toUpperCase()}
                            </span>
                            <div>
                              <h4 className="text-sm font-bold text-neutral-950">
                                {consent.institutionName}
                              </h4>
                              <p className="text-[11px] text-neutral-400">
                                Conta vinculada: {acc?.name || 'Conta principal'} · Válido até{' '}
                                {consent.expiresAt.split('-').reverse().join('/')}
                              </p>
                            </div>
                          </div>

                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                            Ativo
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {consent.scopes.map((sc) => (
                            <span
                              key={sc}
                              className="px-2 py-0.5 rounded-md bg-[#F6F5F2] text-[10px] font-medium text-neutral-600"
                            >
                              {OPEN_FINANCE_SCOPE_INFO[sc].title}
                            </span>
                          ))}
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-neutral-100 text-[11px] text-neutral-400">
                          <span>{consent.importedCount} lançamento(s) sincronizado(s)</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setActiveConsentId(consent.id);
                                setTargetAccountId(consent.accountId);
                                setStep('sync_file');
                              }}
                              className="px-3 py-1.5 rounded-full bg-neutral-950 text-white text-[11px] font-semibold flex items-center gap-1"
                            >
                              <RefreshCw className="w-3 h-3" /> Sincronizar extrato
                            </button>
                            <button
                              onClick={() => onRevokeConsent(consent.id)}
                              className="p-1.5 text-neutral-400 hover:text-red-600"
                              title="Revogar consentimento"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <button
                    onClick={() => setStep('new_consent')}
                    className="w-full py-3 rounded-2xl bg-white border border-neutral-200/80 text-xs font-semibold text-neutral-900 flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> Conectar outra instituição
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ==================== ETAPA 2: NOVO TERMO DE CONSENTIMENTO ==================== */}
          {step === 'new_consent' && (
            <form onSubmit={handleConfirmConsent} className="space-y-4">
              <div className="editorial-card rounded-3xl p-4 space-y-3">
                <label className="text-xs font-bold text-neutral-950 block">
                  1. Selecione a instituição financeira
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {OPEN_FINANCE_INSTITUTIONS.map((inst) => {
                    const selected = selectedInstId === inst.id;
                    return (
                      <button
                        key={inst.id}
                        type="button"
                        onClick={() => setSelectedInstId(inst.id)}
                        className={`p-2.5 rounded-2xl border text-left flex items-center gap-2 transition ${
                          selected
                            ? 'bg-neutral-950 text-white border-neutral-950'
                            : 'bg-[#F6F5F2] text-neutral-900 border-transparent'
                        }`}
                      >
                        <span
                          className="w-6 h-6 rounded-lg text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: inst.color }}
                        >
                          {inst.shortName.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="text-xs font-semibold truncate">
                          {inst.shortName}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Escopos de Permissão do Consentimento */}
              <div className="editorial-card rounded-3xl p-4 space-y-3">
                <label className="text-xs font-bold text-neutral-950 block">
                  2. Dados autorizados no consentimento
                </label>
                <div className="space-y-2">
                  {(Object.keys(OPEN_FINANCE_SCOPE_INFO) as OpenFinanceScope[]).map(
                    (scope) => {
                      const info = OPEN_FINANCE_SCOPE_INFO[scope];
                      const checked = selectedScopes.includes(scope);
                      return (
                        <div
                          key={scope}
                          onClick={() => toggleScope(scope)}
                          className="p-3 rounded-2xl bg-[#F6F5F2] flex items-start justify-between gap-2 cursor-pointer"
                        >
                          <div>
                            <p className="text-xs font-bold text-neutral-900">
                              {info.title}
                            </p>
                            <p className="text-[11px] text-neutral-500">
                              {info.description}
                            </p>
                          </div>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={info.mandatory}
                            onChange={() => {}}
                            className="w-4 h-4 accent-neutral-950 mt-0.5"
                          />
                        </div>
                      );
                    }
                  )}
                </div>
              </div>

              {/* Validade e Conta de Destino */}
              <div className="editorial-card rounded-3xl p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] text-neutral-500 block mb-1">
                      Prazo do consentimento
                    </label>
                    <select
                      value={validityMonths}
                      onChange={(e) =>
                        setValidityMonths(Number(e.target.value) as 3 | 6 | 12)
                      }
                      className="w-full px-3 py-2.5 rounded-xl bg-[#F6F5F2] text-xs font-semibold text-neutral-900"
                    >
                      <option value={3}>3 meses</option>
                      <option value={6}>6 meses</option>
                      <option value={12}>12 meses (Padrão BCB)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-neutral-500 block mb-1">
                      Vincular à conta
                    </label>
                    <select
                      value={targetAccountId}
                      onChange={(e) => setTargetAccountId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-[#F6F5F2] text-xs font-semibold text-neutral-900"
                    >
                      <option value="__new__">
                        + Criar conta "{selectedInstitution.shortName}"
                      </option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <label className="flex items-start gap-2.5 pt-2 border-t border-neutral-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={lgpdAccepted}
                    onChange={(e) => setLgpdAccepted(e.target.checked)}
                    className="w-4 h-4 accent-neutral-950 mt-0.5 flex-shrink-0"
                  />
                  <span className="text-[11px] text-neutral-600 leading-relaxed">
                    Autorizo a importação e classificação local das transações de{' '}
                    <strong>{selectedInstitution.name}</strong>. Os dados permanecem criptografados exclusivamente no meu dispositivo.
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={!lgpdAccepted}
                className="w-full py-3.5 rounded-full bg-neutral-950 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <Lock className="w-3.5 h-3.5" /> Confirmar consentimento e continuar
              </button>
            </form>
          )}

          {/* ==================== ETAPA 3: ENVIAR EXTRATO OFX / CSV ==================== */}
          {step === 'sync_file' && (
            <div className="space-y-4">
              <div className="editorial-card rounded-3xl p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-neutral-950">
                    Selecione o extrato ou fatura do seu banco
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {selectedInstitution.exportHint}
                  </p>
                </div>

                {/* Conta de destino da importação */}
                <div>
                  <label className="text-[11px] text-neutral-500 block mb-1">
                    Conta de destino dos lançamentos
                  </label>
                  <select
                    value={
                      targetAccountId === '__new__'
                        ? accounts[0]?.id || 'principal'
                        : targetAccountId
                    }
                    onChange={(e) => setTargetAccountId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F6F5F2] text-xs font-semibold text-neutral-900"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tipo de CSV caso envie fatura de cartão */}
                <label className="flex items-center justify-between p-3 rounded-2xl bg-[#F6F5F2] cursor-pointer">
                  <div>
                    <p className="text-xs font-semibold text-neutral-900">
                      É fatura de Cartão de Crédito (.CSV)?
                    </p>
                    <p className="text-[10px] text-neutral-500">
                      Ative se estiver importando fatura CSV do cartão (ex: Nubank)
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={isCreditCardCsv}
                    onChange={(e) => setIsCreditCardCsv(e.target.checked)}
                    className="w-4 h-4 accent-neutral-950"
                  />
                </label>

                {/* Botão Upload de Arquivo OFX ou CSV */}
                <label className="w-full py-6 px-4 rounded-3xl border-2 border-dashed border-neutral-300 hover:border-neutral-950 bg-[#F6F5F2]/60 flex flex-col items-center justify-center gap-2 cursor-pointer transition text-center">
                  <div className="w-11 h-11 rounded-2xl bg-neutral-950 text-white flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-neutral-950">
                      Toque para escolher arquivo .OFX ou .CSV
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      Compatível com Nubank, Itaú, Inter, Bradesco, BTG, Santander, C6 e BB
                    </p>
                  </div>
                  <input
                    type="file"
                    accept=".ofx,.qfx,.csv,text/csv,application/x-ofx"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>

                {errorMsg && (
                  <div className="p-3 rounded-2xl bg-red-50 text-red-700 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================== ETAPA 4: REVISÃO E CONSENTIMENTO DOS LANÇAMENTOS ==================== */}
          {step === 'review' && (
            <div className="space-y-4">
              <div className="editorial-card rounded-3xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-950 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-neutral-900" />
                    Revisão de importação ({sourceFormat})
                  </span>
                  <span className="text-[11px] font-semibold text-emerald-700 tabular-nums">
                    {selectedCount} selecionado(s)
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500">
                  As categorias foram identificadas automaticamente. Toque em qualquer categoria se quiser alterar antes de salvar:
                </p>
                {duplicateCount > 0 && (
                  <p className="text-[11px] text-amber-700 font-medium">
                    • {duplicateCount} transação(ões) já existente(s) foram desmarcadas automaticamente para evitar duplicidade.
                  </p>
                )}
              </div>

              <div className="editorial-card rounded-3xl divide-y divide-neutral-100 max-h-[46dvh] overflow-y-auto">
                {parsedItems.map((item, idx) => (
                  <div
                    key={`${item.externalId}-${idx}`}
                    className={`p-3.5 space-y-2 transition ${
                      item.selected ? 'bg-white' : 'bg-neutral-50 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <label className="flex items-start gap-2.5 min-w-0 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setParsedItems((prev) =>
                              prev.map((p, i) =>
                                i === idx ? { ...p, selected: checked } : p
                              )
                            );
                          }}
                          className="w-4 h-4 accent-neutral-950 mt-0.5 flex-shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs font-bold text-neutral-950 truncate">
                              {item.description}
                            </p>
                            {item.isDuplicate && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-bold">
                                Já importado
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-neutral-400 tabular-nums">
                            {item.date.split('-').reverse().join('/')}
                          </p>
                        </div>
                      </label>

                      <span
                        className={`text-xs font-bold tabular-nums flex-shrink-0 ${
                          item.type === 'income' ? 'text-emerald-700' : 'text-neutral-950'
                        }`}
                      >
                        {item.type === 'income' ? '+' : '-'} {formatBRL(item.amount)}
                      </span>
                    </div>

                    {/* Seletor rápido de categoria por linha */}
                    <div className="pl-6 flex items-center gap-2">
                      <select
                        value={item.categoryId}
                        onChange={(e) => {
                          const newCat = e.target.value;
                          setParsedItems((prev) =>
                            prev.map((p, i) =>
                              i === idx ? { ...p, categoryId: newCat } : p
                            )
                          );
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#F6F5F2] text-[11px] font-semibold text-neutral-700"
                      >
                        {categories
                          .filter((c) => c.kind === item.type)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={selectedCount === 0}
                className="w-full py-3.5 rounded-full bg-neutral-950 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <Check className="w-4 h-4" /> Confirmar e importar {selectedCount} lançamento(s)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
