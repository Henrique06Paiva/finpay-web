import React, { useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Download,
  Lock,
  Mic,
  Plus,
  QrCode,
  ScanFace,
  Shield,
  Smartphone,
  Tags,
  Trash2,
  Upload,
  User,
  Wallet,
  FileText,
} from 'lucide-react';
import { SiriShortcutsGuide } from './SiriShortcutsGuide';
import { Database, CloudUpload } from 'lucide-react';
import { buildSyncPayload } from '../services/syncService';
import {
  Account,
  AccountType,
  Category,
  CategoryKind,
  FinanceState,
  Preferences,
  SecuritySettings,
} from '../types/finance';
import {
  ACCOUNT_TYPE_LABEL,
  CATEGORY_ICON_CHOICES,
  PALETTE,
  PROTECTED_CATEGORY_IDS,
} from '../data/defaults';
import {
  decryptBackupPayload,
  encryptBackupPayload,
  hashPin,
  registerBiometrics,
} from '../services/securityService';
import {
  notificationsSupported,
  requestNotifications,
  showLocalNotification,
} from '../services/notifyService';
import { formatBRL, parseMoney, toInputMoney } from '../utils/format';
import { CategoryIcon } from './CategoryIcon';

interface SettingsTabProps {
  accounts: Account[];
  accountBalances: Record<string, number>;
  categories: Category[];
  security: SecuritySettings;
  prefs: Preferences;
  fullState: FinanceState;
  hideBalances: boolean;
  onUpdatePrefs: (prefs: Preferences) => void;
  onAddAccount: (acc: Omit<Account, 'id'>) => void;
  onUpdateAccountBalance: (accountId: string, newInitialBalance: number) => void;
  onDeleteAccount: (accountId: string) => void;
  onAddCategory: (cat: Omit<Category, 'id'>) => void;
  onDeleteCategory: (catId: string) => void;
  onUpdateSecurity: (next: SecuritySettings) => void;
  onRestoreState: (state: Partial<FinanceState>) => void;
  onLockNow: () => void;
  onResetAll: () => void;
  onOpenPayroll?: () => void;
  onOpenSyncModal?: () => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  accounts,
  accountBalances,
  categories,
  security,
  prefs,
  fullState,
  hideBalances,
  onUpdatePrefs,
  onAddAccount,
  onUpdateAccountBalance,
  onDeleteAccount,
  onAddCategory,
  onDeleteCategory,
  onUpdateSecurity,
  onRestoreState,
  onLockNow,
  onResetAll,
  onOpenPayroll,
  onOpenSyncModal,
}) => {
  const [section, setSection] = useState<
    'profile' | 'accounts' | 'categories' | 'notifications' | 'security' | 'shortcuts'
  >('accounts');

  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Perfil
  const [userName, setUserName] = useState(prefs.profile?.name || '');
  const [userEmail, setUserEmail] = useState(prefs.profile?.email || '');

  // Contas
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<AccountType>('checking');
  const [accInitial, setAccInitial] = useState('');
  const [editingAccId, setEditingAccId] = useState<string | null>(null);
  const [editInitialInput, setEditInitialInput] = useState('');

  // Categorias
  const [catName, setCatName] = useState('');
  const [catKind, setCatKind] = useState<CategoryKind>('expense');
  const [catIcon, setCatIcon] = useState('ShoppingBag');
  const [catColor, setCatColor] = useState(PALETTE[2]);

  // Segurança
  const [newPin, setNewPin] = useState('');
  const [isRegisteringFaceId, setIsRegisteringFaceId] = useState(false);

  const notify = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 3500);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdatePrefs({
      ...prefs,
      profile: {
        name: userName.trim(),
        email: userEmail.trim() || undefined,
      },
    });
    notify('Perfil salvo com sucesso.');
  };

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim()) return;
    onAddAccount({
      name: accName.trim(),
      type: accType,
      initialBalance: parseMoney(accInitial),
      color: PALETTE[accounts.length % PALETTE.length],
    });
    setAccName('');
    setAccInitial('');
    notify('Conta adicionada com sucesso.');
  };

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    onAddCategory({
      name: catName.trim(),
      kind: catKind,
      icon: catIcon,
      color: catColor,
      custom: true,
    });
    setCatName('');
    notify('Categoria criada com sucesso.');
  };

  const handleToggleReminders = async () => {
    if (!prefs.remindersEnabled) {
      const granted = await requestNotifications();
      onUpdatePrefs({ ...prefs, remindersEnabled: true });
      if (granted) {
        await showLocalNotification(
          'Lembretes ativados',
          'Você será avisado sobre contas próximas do vencimento e alertas de orçamento.'
        );
        notify('Notificações e alertas ativados!');
      } else {
        notify('Alertas internos ativados no app.');
      }
    } else {
      onUpdatePrefs({ ...prefs, remindersEnabled: false });
      notify('Lembretes desativados.');
    }
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(newPin)) {
      notify('Digite exatamente 4 dígitos numéricos.');
      return;
    }
    const hashed = await hashPin(newPin);
    onUpdateSecurity({ ...security, pinHash: hashed });
    setNewPin('');
    notify('PIN de 4 dígitos configurado.');
  };

  const handleActivateFaceId = async () => {
    setIsRegisteringFaceId(true);
    let currentPinHash = security.pinHash;
    if (!currentPinHash) {
      currentPinHash = await hashPin('0000');
    }
    const res = await registerBiometrics();
    setIsRegisteringFaceId(false);

    if (res.ok && res.credentialId) {
      onUpdateSecurity({
        ...security,
        pinHash: currentPinHash,
        biometricsEnabled: true,
        webAuthnCredentialId: res.credentialId,
      });
      notify('Face ID vinculado com sucesso!');
    } else {
      notify(res.error || 'Não foi possível ativar o Face ID neste navegador.');
    }
  };

  const handleExport = async () => {
    const raw = JSON.stringify(fullState, null, 2);
    const content = await encryptBackupPayload(raw);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finpay-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Backup exportado para seus Arquivos.');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const decrypted = await decryptBackupPayload(text);
      const parsed = JSON.parse(decrypted);
      onRestoreState(parsed);
      notify('Dados restaurados com sucesso!');
    } catch {
      notify('Arquivo de backup inválido.');
    }
    e.target.value = '';
  };

  return (
    <div className="space-y-5 pb-10 animate-view">
      {/* Cabeçalho da Tela de Configurações */}
      <div className="pt-1">
        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
          Perfil, contas, categorias, notificações e segurança
        </p>
        <h2 className="text-2xl font-bold text-neutral-950 mt-0.5">Configurações</h2>
      </div>

      {/* Sub-navegação em Pílulas pelas áreas de Configurações */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {onOpenPayroll && (
          <button
            onClick={onOpenPayroll}
            className="px-3.5 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 flex-shrink-0 bg-emerald-950 text-emerald-200 border border-emerald-800"
          >
            <FileText className="w-3.5 h-3.5" />
            Holerite CLT
          </button>
        )}
        {(
          [
            { id: 'accounts', label: 'Contas', icon: Wallet },
            { id: 'categories', label: 'Categorias', icon: Tags },
            { id: 'shortcuts', label: 'Atalhos da Siri', icon: Mic },
            { id: 'security', label: 'Segurança & Face ID', icon: Shield },
            { id: 'notifications', label: 'Notificações', icon: Bell },
            { id: 'profile', label: 'Perfil', icon: User },
          ] as const
        ).map((tab) => {
          const IconComp = tab.icon;
          const active = section === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSection(tab.id)}
              className={`px-3.5 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 flex-shrink-0 transition ${
                active
                  ? 'bg-neutral-950 text-white'
                  : 'bg-white border border-neutral-200/80 text-neutral-600'
              }`}
            >
              <IconComp className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {statusMsg && (
        <div className="p-3.5 rounded-2xl bg-neutral-900 text-white text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* 1. ABA CONTAS BANCÁRIAS */}
      {section === 'accounts' && (
        <div className="space-y-4">
          <section className="editorial-card rounded-3xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-neutral-950">Suas contas e carteiras</h3>
              <p className="text-xs text-neutral-400">
                Gerencie o saldo inicial e acompanhe o saldo atual de cada instituição
              </p>
            </div>

            <div className="divide-y divide-neutral-100">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="py-3.5 first:pt-1 last:pb-1 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: acc.color }}
                    />
                    <div>
                      <p className="text-sm font-bold text-neutral-900">{acc.name}</p>
                      <p className="text-[11px] text-neutral-400">
                        {ACCOUNT_TYPE_LABEL[acc.type]} · Inicial:{' '}
                        {formatBRL(acc.initialBalance, hideBalances)}
                      </p>
                    </div>
                  </div>

                  {editingAccId === acc.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        autoFocus
                        value={editInitialInput}
                        onChange={(e) => setEditInitialInput(e.target.value)}
                        placeholder="Saldo inicial"
                        className="w-24 px-2.5 py-1 rounded-lg bg-[#F6F5F2] text-xs font-bold tabular-nums"
                      />
                      <button
                        onClick={() => {
                          onUpdateAccountBalance(acc.id, parseMoney(editInitialInput));
                          setEditingAccId(null);
                          notify('Saldo inicial atualizado.');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-neutral-950 text-white text-xs font-semibold"
                      >
                        OK
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 tabular-nums">
                      <button
                        onClick={() => {
                          setEditInitialInput(toInputMoney(acc.initialBalance));
                          setEditingAccId(acc.id);
                        }}
                        className="text-right"
                      >
                        <p className="text-sm font-bold text-neutral-950">
                          {formatBRL(accountBalances[acc.id] || 0, hideBalances)}
                        </p>
                        <p className="text-[10px] text-neutral-400 underline">
                          Editar saldo inicial
                        </p>
                      </button>
                      {accounts.length > 1 && (
                        <button
                          onClick={() => onDeleteAccount(acc.id)}
                          className="p-1 text-neutral-300 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <form
            onSubmit={handleCreateAccount}
            className="editorial-card rounded-3xl p-5 space-y-3.5"
          >
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Nova conta ou cartão
            </h4>
            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="text"
                required
                value={accName}
                onChange={(e) => setAccName(e.target.value)}
                placeholder="Ex: Itaú, Nubank, BTG..."
                className="px-3.5 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900"
              />
              <select
                value={accType}
                onChange={(e) => setAccType(e.target.value as AccountType)}
                className="px-3 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900"
              >
                <option value="checking">Conta corrente</option>
                <option value="savings">Poupança</option>
                <option value="investment">Investimentos</option>
                <option value="wallet">Carteira / Dinheiro</option>
                <option value="credit">Cartão de crédito</option>
              </select>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={accInitial}
                onChange={(e) => setAccInitial(e.target.value)}
                placeholder="Saldo inicial (R$ 0,00)"
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900 tabular-nums"
              />
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-neutral-950 text-white text-xs font-semibold"
              >
                Adicionar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. ABA CATEGORIAS */}
      {section === 'categories' && (
        <div className="space-y-4">
          <form
            onSubmit={handleCreateCategory}
            className="editorial-card rounded-3xl p-5 space-y-3.5"
          >
            <h3 className="text-sm font-bold text-neutral-950">Criar nova categoria</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="text"
                required
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="Nome da categoria..."
                className="px-3.5 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900"
              />
              <select
                value={catKind}
                onChange={(e) => setCatKind(e.target.value as CategoryKind)}
                className="px-3 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900"
              >
                <option value="expense">Despesa</option>
                <option value="income">Receita</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <select
                value={catIcon}
                onChange={(e) => setCatIcon(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900"
              >
                {CATEGORY_ICON_CHOICES.map((ic) => (
                  <option key={ic} value={ic}>
                    Ícone: {ic}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1.5 overflow-x-auto px-1">
                {PALETTE.slice(0, 7).map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setCatColor(color)}
                    className={`w-6 h-6 rounded-full flex-shrink-0 transition ${
                      catColor === color ? 'ring-2 ring-neutral-950 ring-offset-2' : ''
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-neutral-950 text-white text-xs font-semibold"
            >
              + Salvar categoria
            </button>
          </form>

          <section className="editorial-card rounded-3xl p-5 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Categorias cadastradas ({categories.length})
            </h3>
            <div className="divide-y divide-neutral-100">
              {categories.map((c) => {
                const isProtected = PROTECTED_CATEGORY_IDS.includes(c.id);
                return (
                  <div
                    key={c.id}
                    className="py-2.5 first:pt-1 last:pb-1 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-7 h-7 rounded-xl flex items-center justify-center text-white"
                        style={{ backgroundColor: c.color }}
                      >
                        <CategoryIcon name={c.icon} className="w-3.5 h-3.5" />
                      </span>
                      <div>
                        <p className="text-xs font-bold text-neutral-900">{c.name}</p>
                        <p className="text-[10px] text-neutral-400">
                          {c.kind === 'income' ? 'Receita' : 'Despesa'}
                        </p>
                      </div>
                    </div>
                    {!isProtected && (
                      <button
                        onClick={() => onDeleteCategory(c.id)}
                        className="p-1 text-neutral-300 hover:text-red-600"
                        title="Remover categoria"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* 3. ABA SEGURANÇA & FACE ID */}
      {section === 'security' && (
        <div className="space-y-4">
          <section className="editorial-card rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-neutral-950 text-white flex items-center justify-center">
                  <ScanFace className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-neutral-950">Face ID / Touch ID</h3>
                    {security.biometricsEnabled && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                        Ativo
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500">
                    Desbloqueio biométrico nativo do iPhone
                  </p>
                </div>
              </div>

              {(security.pinHash || security.biometricsEnabled) && (
                <button
                  onClick={onLockNow}
                  className="px-3 py-1.5 rounded-full bg-neutral-950 text-white text-xs font-semibold flex items-center gap-1"
                >
                  <Lock className="w-3 h-3" /> Bloquear
                </button>
              )}
            </div>

            <button
              onClick={handleActivateFaceId}
              disabled={isRegisteringFaceId}
              className="w-full py-3 rounded-2xl bg-neutral-950 text-white text-xs font-semibold flex items-center justify-center gap-2 active:scale-[0.99] transition"
            >
              <ScanFace className="w-4 h-4" />
              {isRegisteringFaceId
                ? 'Solicitando Face ID...'
                : security.biometricsEnabled
                ? 'Reconfigurar Face ID'
                : 'Ativar Face ID no iPhone'}
            </button>
          </section>

          <form
            onSubmit={handleSavePin}
            className="editorial-card rounded-3xl p-5 space-y-3"
          >
            <div>
              <h3 className="text-sm font-bold text-neutral-950">PIN de 4 dígitos</h3>
              <p className="text-xs text-neutral-500">
                Senha rápida ao abrir o aplicativo ou como alternativa ao Face ID
              </p>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                placeholder="Digite 4 números"
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#F6F5F2] text-xs font-bold tracking-widest tabular-nums"
              />
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-neutral-950 text-white text-xs font-semibold"
              >
                Salvar
              </button>
              {security.pinHash && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSecurity({
                      ...security,
                      pinHash: null,
                      biometricsEnabled: false,
                      webAuthnCredentialId: null,
                    })
                  }
                  className="px-3 py-2.5 rounded-xl bg-neutral-100 text-neutral-600 text-xs"
                >
                  Remover
                </button>
              )}
            </div>
          </form>

                    {/* Sincronização em Nuvem / PostgreSQL */}
          <section className="editorial-card rounded-3xl p-5 space-y-3.5 bg-gradient-to-br from-white to-blue-50/40 border border-blue-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-neutral-950 flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-blue-600" /> PostgreSQL & Nuvem (DBeaver)
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Envie seus lançamentos para o banco de dados PostgreSQL conectado ao DBeaver
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  const payload = buildSyncPayload(fullState);
                  const res = await fetch('/api/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                  });
                  const data = await res.json();
                  if (data.success) {
                    notify('Dados gravados no PostgreSQL com sucesso!');
                  } else {
                    notify(data.message || 'Banco aguardando string de produção.');
                  }
                } catch {
                  notify('Modo local: conecte a API ao banco PostgreSQL no Docker ou Nuvem.');
                }
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-blue-950 text-white font-semibold text-xs flex items-center justify-center gap-2 hover:bg-blue-900 active:scale-95 transition"
            >
              <CloudUpload className="w-3.5 h-3.5 text-blue-300" /> Sincronizar com PostgreSQL
            </button>
          </section>

          {/* Sincronização Offline Cross-Platform */}
          <section className="editorial-card rounded-3xl p-5 space-y-3.5 bg-gradient-to-br from-white to-emerald-50/40 border border-emerald-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-neutral-950 flex items-center gap-1.5">
                  <QrCode className="w-4 h-4 text-emerald-600" /> Sincronização Offline (QR Code)
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Transfira contas, dívidas e metas entre seu iPhone e o Android / PAX A910 sem internet
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenSyncModal}
              className="w-full py-2.5 px-3 rounded-xl bg-neutral-950 text-white font-semibold text-xs flex items-center justify-center gap-2 hover:bg-neutral-900 transition"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-400" /> Abrir Painel de Sincronização QR
            </button>
          </section>

          <section className="editorial-card rounded-3xl p-5 space-y-3.5">
            <div>
              <h3 className="text-sm font-bold text-neutral-950">
                Backup Local & Restauração (iCloud / Arquivos)
              </h3>
              <p className="text-xs text-neutral-500">
                Exporte seus dados para guardar uma cópia segura ou restaurar em outro aparelho
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={handleExport}
                className="py-2.5 px-3 rounded-xl bg-[#F6F5F2] text-neutral-900 font-semibold text-xs flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Exportar JSON
              </button>
              <label className="py-2.5 px-3 rounded-xl bg-[#F6F5F2] text-neutral-900 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer">
                <Upload className="w-3.5 h-3.5" /> Importar JSON
                <input type="file" accept=".json" onChange={handleImport} className="hidden" />
              </label>
            </div>

            <div className="pt-3 border-t border-neutral-100 flex items-center justify-between">
              <span className="text-xs text-neutral-500">Apagar todos os registros e começar do zero</span>
              <button
                onClick={() => {
                  onResetAll();
                  notify('Aplicativo zerado com sucesso.');
                }}
                className="px-3 py-1.5 rounded-xl bg-red-50 text-red-600 text-xs font-semibold"
              >
                Zerar tudo
              </button>
            </div>
          </section>
        </div>
      )}

      {/* 4. ABA ATALHOS DA SIRI & WEBHOOKS */}
      {section === 'shortcuts' && (
        <SiriShortcutsGuide />
      )}

      {/* 5. ABA NOTIFICAÇÕES */}
      {section === 'notifications' && (
        <section className="editorial-card rounded-3xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-neutral-950">
                Lembretes de vencimentos e orçamento
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Receba avisos quando uma conta fixa estiver próxima do vencimento ou quando um limite atingir 50%, 80% e 100%
              </p>
            </div>
            <button
              onClick={handleToggleReminders}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition flex-shrink-0 ${
                prefs.remindersEnabled
                  ? 'bg-emerald-700 text-white'
                  : 'bg-neutral-950 text-white'
              }`}
            >
              {prefs.remindersEnabled ? 'Ativado' : 'Ativar'}
            </button>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#F6F5F2] text-xs text-neutral-600 space-y-1">
            <p className="font-semibold text-neutral-900">Como funciona no iPhone:</p>
            <p>
              {notificationsSupported()
                ? 'Seu navegador suporta notificações locais. Com o app adicionado à Tela de Início (iOS 16.4+), os avisos aparecem diretamente na tela de bloqueio.'
                : 'Os avisos de vencimento e alertas de 50%, 80% e 100% do orçamento aparecem em destaque no topo da Visão Geral.'}
            </p>
          </div>

          <label className="flex items-center justify-between pt-2 border-t border-neutral-100 cursor-pointer">
            <span className="text-xs font-medium text-neutral-800">
              Iniciar o aplicativo com saldos ocultos (Modo Privacidade)
            </span>
            <input
              type="checkbox"
              checked={security.hideBalancesByDefault}
              onChange={(e) =>
                onUpdateSecurity({
                  ...security,
                  hideBalancesByDefault: e.target.checked,
                })
              }
              className="w-4 h-4 accent-neutral-950 rounded"
            />
          </label>
        </section>
      )}

      {/* 5. ABA PERFIL */}
      {section === 'profile' && (
        <form
          onSubmit={handleSaveProfile}
          className="editorial-card rounded-3xl p-5 space-y-4"
        >
          <div>
            <h3 className="text-sm font-bold text-neutral-950">Seu Perfil</h3>
            <p className="text-xs text-neutral-500">
              Personalize sua identificação local no aplicativo
            </p>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Seu nome</label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Ex: Henrique Paiva"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900"
            />
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">E-mail (opcional)</label>
            <input
              type="email"
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#F6F5F2] text-xs text-neutral-900"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-full bg-neutral-950 text-white text-xs font-semibold"
          >
            Salvar perfil
          </button>
        </form>
      )}
    </div>
  );
};
