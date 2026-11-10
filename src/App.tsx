import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ChevronRight,
  Eye,
  EyeOff,
  Landmark,
  LayoutGrid,
  Menu,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Target,
  Wallet,
  X,
} from 'lucide-react';
import { AppTab, Transaction, TxType } from './types/finance';
import { DEFAULT_PAYROLL } from './data/defaults';
import { useFinanceStore } from './hooks/useFinanceStore';
import { currentYM, formatLongToday } from './utils/date';
import { HomeDashboardTab } from './components/HomeDashboardTab';
import { LockScreen } from './components/LockScreen';
import { parseSiriShortcutUrl } from './services/syncService';
import { haptic } from './services/hapticService';
import { CURRENT_SYSTEM_VERSION } from './data/version';

// Code-splitting (Lazy Loading) para manter o carregamento inicial instantâneo no iPhone
const TransactionsTab = lazy(() =>
  import('./components/TransactionsTab').then((m) => ({ default: m.TransactionsTab }))
);
const PlanningTab = lazy(() =>
  import('./components/PlanningTab').then((m) => ({ default: m.PlanningTab }))
);
const DebtsTab = lazy(() =>
  import('./components/DebtsTab').then((m) => ({ default: m.DebtsTab }))
);
const GoalsAndMarketTab = lazy(() =>
  import('./components/GoalsAndMarketTab').then((m) => ({ default: m.GoalsAndMarketTab }))
);
const SettingsTab = lazy(() =>
  import('./components/SettingsTab').then((m) => ({ default: m.SettingsTab }))
);
const TransactionModal = lazy(() =>
  import('./components/TransactionModal').then((m) => ({ default: m.TransactionModal }))
);
const OpenFinanceModal = lazy(() =>
  import('./components/OpenFinanceModal').then((m) => ({ default: m.OpenFinanceModal }))
);
const PayrollModal = lazy(() =>
  import('./components/PayrollModal').then((m) => ({ default: m.PayrollModal }))
);
const SyncModal = lazy(() =>
  import('./components/SyncModal').then((m) => ({ default: m.SyncModal }))
);
const UpdatesModal = lazy(() =>
  import('./components/UpdatesModal').then((m) => ({ default: m.UpdatesModal }))
);

const NAV_ITEMS: Array<{
  id: AppTab;
  title: string;
  shortTitle: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'home',
    title: 'Visão geral',
    shortTitle: 'Início',
    subtitle: 'Saldo, receitas, despesas e resumo mensal.',
    icon: LayoutGrid,
  },
  {
    id: 'tx',
    title: 'Lançamentos',
    shortTitle: 'Extrato',
    subtitle: 'Histórico, filtros e cadastro de movimentações.',
    icon: ArrowLeftRight,
  },
  {
    id: 'plan',
    title: 'Orçamento',
    shortTitle: 'Orçamento',
    subtitle: 'Limites de gastos, categorias e contas fixas.',
    icon: Wallet,
  },
  {
    id: 'debts',
    title: 'Dívidas',
    shortTitle: 'Dívidas',
    subtitle: 'Empréstimos, juros, parcelas e simulador de quitação.',
    icon: Landmark,
  },
  {
    id: 'goals',
    title: 'Metas',
    shortTitle: 'Metas',
    subtitle: 'Objetivos, aportes, progresso e taxas do BCB.',
    icon: Target,
  },
  {
    id: 'settings',
    title: 'Configurações',
    shortTitle: 'Ajustes',
    subtitle: 'Perfil, contas, categorias, notificações e segurança.',
    icon: SlidersHorizontal,
  },
];

export function App() {
  const store = useFinanceStore();
  const { state, market, loadingMarket, accountBalances } = store;

  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [selectedYm, setSelectedYm] = useState<string>(() => currentYM());
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);

  const [isLocked, setIsLocked] = useState<boolean>(() =>
    Boolean(state.security.pinHash || state.security.biometricsEnabled)
  );
  const [hideBalances, setHideBalances] = useState<boolean>(
    state.security.hideBalancesByDefault
  );

  const [txModalOpen, setTxModalOpen] = useState<boolean>(false);
  const [txModalDefaultType, setTxModalDefaultType] = useState<TxType>('expense');
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [shortcutInitialValues, setShortcutInitialValues] = useState<{
    amount?: number;
    description?: string;
    categoryId?: string;
  } | null>(null);

  const [openFinanceOpen, setOpenFinanceOpen] = useState<boolean>(false);
  const [payrollModalOpen, setPayrollModalOpen] = useState<boolean>(false);
  const [syncModalOpen, setSyncModalOpen] = useState<boolean>(false);

  // Alerta de Atualizações & Novidades do Sistema
  const [updatesModalOpen, setUpdatesModalOpen] = useState<boolean>(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<
    'cloud' | 'accounts' | 'categories' | 'shortcuts' | 'security' | 'notifications' | 'profile' | undefined
  >(undefined);
  const [hasUnreadUpdates, setHasUnreadUpdates] = useState<boolean>(() => {
    try {
      const lastSeen = localStorage.getItem('finpay_last_seen_version');
      return lastSeen !== CURRENT_SYSTEM_VERSION;
    } catch {
      return true;
    }
  });
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(false);

  const handleOpenUpdatesModal = () => {
    haptic.tap();
    setUpdatesModalOpen(true);
  };

  const handleNavigateToProfileSettings = () => {
    setSettingsInitialSection('profile');
    setActiveTab('settings');
    setUpdatesModalOpen(false);
    setHasUnreadUpdates(false);
    try {
      localStorage.setItem('finpay_last_seen_version', CURRENT_SYSTEM_VERSION);
    } catch {}
  };

  // Trata parâmetros de inicialização de Atalhos da Siri ou Webhooks (ex: ?add=expense&val=50&desc=Almoco)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const shortcut = parseSiriShortcutUrl(window.location.search);
    if (!shortcut) return;

    if (shortcut.action === 'add_tx') {
      setEditingTx(null);
      setTxModalDefaultType(shortcut.type || 'expense');
      setShortcutInitialValues({
        amount: shortcut.amount,
        description: shortcut.description,
        categoryId: shortcut.category,
      });
      setTxModalOpen(true);
    } else if (shortcut.action === 'view_tab' && shortcut.tab) {
      const match = NAV_ITEMS.find((n) => n.id === shortcut.tab);
      if (match) setActiveTab(match.id);
    }

    // Limpa a query string da URL sem recarregar a página
    window.history.replaceState({}, document.title, window.location.pathname);
  }, []);

  const currentNavMeta = useMemo(
    () => NAV_ITEMS.find((n) => n.id === activeTab) || NAV_ITEMS[0],
    [activeTab]
  );

  const handleOpenNewTx = (defaultType: TxType = 'expense') => {
    setEditingTx(null);
    setShortcutInitialValues(null);
    setTxModalDefaultType(defaultType);
    setTxModalOpen(true);
  };

  return (
    <div className="min-h-[100dvh] bg-[#F6F5F2] text-[#111111] flex flex-col max-w-md mx-auto relative select-none shadow-sm">
      {isLocked && state.security.pinHash && (
        <LockScreen
          expectedPinHash={state.security.pinHash}
          biometricsEnabled={state.security.biometricsEnabled}
          credentialId={state.security.webAuthnCredentialId}
          onUnlock={() => setIsLocked(false)}
        />
      )}

      {/* ==================== MENU GAVETA MOBILE ESCURO ==================== */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex"
          onClick={() => setDrawerOpen(false)}
        >
          <aside
            className="w-[86%] max-w-[330px] bg-[#0E0F12] text-white h-full p-5 flex flex-col justify-between shadow-2xl animate-view overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <img
                    src="/icon.svg"
                    alt="FinPay Logo"
                    className="w-10 h-10 rounded-2xl object-cover shadow-md shadow-emerald-950/40 border border-white/10 flex-shrink-0"
                  />
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-neutral-400 font-semibold">
                      Navegação Principal
                    </p>
                    <h2 className="text-lg font-bold text-white mt-0.5">
                      FinPay
                    </h2>
                  </div>
                </div>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/10 text-neutral-300 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <nav className="space-y-2">
                {NAV_ITEMS.map((item) => {
                  const IconComp = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setDrawerOpen(false);
                      }}
                      className={`w-full text-left p-3.5 rounded-2xl flex items-start gap-3.5 transition ${
                        active
                          ? 'bg-white/14 text-white'
                          : 'bg-white/[0.03] text-neutral-300 hover:bg-white/8'
                      }`}
                    >
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          active ? 'bg-white text-neutral-950' : 'bg-white/8 text-neutral-300'
                        }`}
                      >
                        <IconComp className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white leading-snug">
                          {item.title}
                        </p>
                        <p className="text-xs text-neutral-400 leading-relaxed mt-0.5">
                          {item.subtitle}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </nav>

              <div className="pt-3 border-t border-white/10">
                <button
                  onClick={() => {
                    setDrawerOpen(false);
                    handleOpenUpdatesModal();
                  }}
                  className="w-full text-left p-3 rounded-2xl flex items-center justify-between transition bg-gradient-to-r from-pink-500/10 to-purple-500/10 border border-white/10 text-neutral-300 hover:bg-white/10"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white flex items-center gap-1.5">
                        Novidades do Sistema
                        {hasUnreadUpdates && (
                          <span className="px-1.5 py-0.2 rounded-full bg-pink-500 text-white text-[9px] font-bold">
                            Novo
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-neutral-400">
                        Modo Casal, Nuvem e Atualizações
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-white/10 text-[11px] text-neutral-400 flex items-center justify-between">
              <span>{formatLongToday()}</span>
              <span>IndexedDB Local</span>
            </div>
          </aside>
        </div>
      )}

      {/* ==================== HEADER SUPERIOR MOBILE ==================== */}
      <header className="sticky top-0 z-30 safe-top px-4 pb-3 bg-[#F6F5F2]/90 backdrop-blur-md border-b border-neutral-200/60 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => setDrawerOpen(true)}
            className="w-9 h-9 rounded-full bg-neutral-950 text-white flex items-center justify-center flex-shrink-0 active:scale-90 transition"
            title="Abrir menu de telas"
          >
            <Menu className="w-4 h-4" />
          </button>

          <div className="min-w-0">
            <p className="text-[10px] font-medium text-neutral-400 truncate">
              {state.prefs.profile?.name
                ? `${state.prefs.profile.name} · ${formatLongToday()}`
                : formatLongToday()}
            </p>
            <h1 className="text-base font-bold tracking-tight text-neutral-950 truncate">
              {currentNavMeta.title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Botão de Atualizações & Novidades (Sempre disponível) */}
          <button
            onClick={handleOpenUpdatesModal}
            className="relative w-9 h-9 rounded-full bg-white border border-neutral-200/80 flex items-center justify-center text-neutral-700 active:scale-90 transition hover:bg-neutral-50"
            title="Atualizações & Novidades do Sistema"
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            {hasUnreadUpdates && (
              <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-pink-600 border border-white" />
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition ${
              activeTab === 'settings'
                ? 'bg-neutral-950 text-white'
                : 'bg-white border border-neutral-200/80 text-neutral-700'
            }`}
            title="Configurações"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          <button
            onClick={() => setHideBalances((prev) => !prev)}
            className="w-9 h-9 rounded-full bg-white border border-neutral-200/80 flex items-center justify-center text-neutral-700 active:scale-90 transition"
            title="Ocultar/Mostrar saldos"
          >
            {hideBalances ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>

          <button
            onClick={() => { haptic.tap(); handleOpenNewTx('expense'); }}
            className="h-9 px-3.5 rounded-full bg-neutral-950 text-white font-semibold text-xs flex items-center gap-1 active:scale-95 transition"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" /> Lançar
          </button>
        </div>
      </header>

      {/* ==================== MINI ALERTA DE NOTIFICAÇÃO DE ATUALIZAÇÕES ==================== */}
      {hasUnreadUpdates && !bannerDismissed && (
        <div className="px-4 pt-2.5 pb-1 animate-view">
          <div className="p-3 rounded-2xl bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-600 text-white shadow-md flex items-center justify-between gap-2.5">
            <div
              onClick={handleOpenUpdatesModal}
              className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1"
            >
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 backdrop-blur-xs">
                <Sparkles className="w-4 h-4 text-amber-300" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-extrabold uppercase tracking-wider bg-white/20 px-1.5 py-0.2 rounded-md">
                    Nova Atualização
                  </span>
                  <span className="text-[10px] text-pink-100 font-semibold">v2.2</span>
                </div>
                <p className="text-xs font-bold truncate mt-0.5">
                  💑 Modo Casal & Conta Conjunta disponível!
                </p>
                <p className="text-[10px] text-pink-100 truncate">
                  Toque para ver como ativar em Ajustes ➔ Perfil
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={handleOpenUpdatesModal}
                className="px-2.5 py-1.5 rounded-xl bg-white text-neutral-900 text-[11px] font-bold shadow-xs active:scale-95 transition"
              >
                Ver
              </button>
              <button
                onClick={() => setBannerDismissed(true)}
                className="w-7 h-7 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
                title="Dispensar alerta"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== CONTEÚDO MOBILE ==================== */}
      <main className="flex-1 px-4 pt-3 pb-28">
        <Suspense
          fallback={
            <div className="py-12 text-center text-xs text-neutral-400">
              Carregando módulo...
            </div>
          }
        >
          {activeTab === 'home' && (
            <HomeDashboardTab
              selectedYm={selectedYm}
              onChangeYm={setSelectedYm}
              accounts={state.accounts}
              categories={state.categories}
              transactions={state.transactions}
              budgets={state.budgets}
              bills={state.bills}
              debts={state.debts}
              payroll={state.payroll || DEFAULT_PAYROLL}
              goals={state.goals}
              profile={state.prefs.profile}
              hideBalances={hideBalances}
              onOpenNewTx={handleOpenNewTx}
              onOpenOpenFinance={() => setOpenFinanceOpen(true)}
              onOpenPayroll={() => setPayrollModalOpen(true)}
              onUpdateAccountBalance={store.updateAccountBalance}
              onManageAccounts={() => setActiveTab('settings')}
              onPayBill={store.payBill}
              onMarkTxPaid={store.toggleTxStatus}
              onNavigateTab={setActiveTab}
            />
          )}

          {activeTab === 'tx' && (
            <TransactionsTab
              selectedYm={selectedYm}
              transactions={state.transactions}
              accounts={state.accounts}
              categories={state.categories}
              profile={state.prefs.profile}
              hideBalances={hideBalances}
              onOpenNewTx={handleOpenNewTx}
              onOpenOpenFinance={() => setOpenFinanceOpen(true)}
              onEditTx={(tx) => {
                setEditingTx(tx);
                setTxModalOpen(true);
              }}
              onDeleteTx={store.deleteTransaction}
              onToggleTxStatus={store.toggleTxStatus}
            />
          )}

          {activeTab === 'plan' && (
            <PlanningTab
              selectedYm={selectedYm}
              onChangeYm={setSelectedYm}
              categories={state.categories}
              accounts={state.accounts}
              transactions={state.transactions}
              budgets={state.budgets}
              bills={state.bills}
              monthlyOverallBudget={state.security.monthlyOverallBudget}
              dismissedSuggestions={state.prefs.dismissedSuggestions}
              hideBalances={hideBalances}
              onSaveBudget={store.saveBudget}
              onUpdateOverallBudget={store.updateOverallBudget}
              onAddBill={store.addBill}
              onPayBill={store.payBill}
              onDeleteBill={store.deleteBill}
              onDismissSuggestion={store.dismissSuggestion}
            />
          )}

          {activeTab === 'debts' && (
            <DebtsTab
              debts={state.debts}
              accounts={state.accounts}
              hideBalances={hideBalances}
              onAddDebt={store.addDebt}
              onPayInstallment={store.payDebtInstallment}
              onAmortizeDebt={store.amortizeDebt}
              onDeleteDebt={store.deleteDebt}
            />
          )}

          {activeTab === 'goals' && (
            <GoalsAndMarketTab
              goals={state.goals}
              market={market}
              isLoadingMarket={loadingMarket}
              hideBalances={hideBalances}
              onAddGoal={store.addGoal}
              onContributeGoal={store.contributeGoal}
              onDeleteGoal={store.deleteGoal}
              onRefreshMarket={store.refreshMarket}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsTab
              accounts={state.accounts}
              accountBalances={accountBalances}
              categories={state.categories}
              security={state.security}
              prefs={state.prefs}
              fullState={state}
              hideBalances={hideBalances}
              onUpdatePrefs={store.updatePrefs}
              onAddAccount={store.addAccount}
              onUpdateAccountBalance={store.updateAccountBalance}
              onDeleteAccount={store.deleteAccount}
              onAddCategory={store.addCategory}
              onDeleteCategory={store.deleteCategory}
              onUpdateSecurity={store.updateSecurity}
              onRestoreState={store.restoreState}
              onLockNow={() => setIsLocked(true)}
              onResetAll={store.resetAll}
              onOpenPayroll={() => setPayrollModalOpen(true)}
              onOpenSyncModal={() => setSyncModalOpen(true)}
              initialSection={settingsInitialSection}
            />
          )}
        </Suspense>
      </main>

      {/* Modais Lazy-Loaded (carregados apenas quando abertos) */}
      <Suspense fallback={null}>
        {txModalOpen && (
          <TransactionModal
            isOpen={txModalOpen}
            defaultType={txModalDefaultType}
            editingTx={editingTx}
            initialValues={shortcutInitialValues}
            accounts={state.accounts}
            categories={state.categories}
            goals={state.goals}
            profile={state.prefs.profile}
            onClose={() => {
              setTxModalOpen(false);
              setEditingTx(null);
              setShortcutInitialValues(null);
            }}
            onSave={store.saveTransaction}
          />
        )}

        {openFinanceOpen && (
          <OpenFinanceModal
            isOpen={openFinanceOpen}
            accounts={state.accounts}
            categories={state.categories}
            existingTransactions={state.transactions}
            consents={state.prefs.openFinanceConsents || []}
            onClose={() => setOpenFinanceOpen(false)}
            onCreateConsent={store.createOpenFinanceConsent}
            onRevokeConsent={store.revokeOpenFinanceConsent}
            onImportTransactions={store.importOpenFinanceTransactions}
          />
        )}

        {payrollModalOpen && (
          <PayrollModal
            isOpen={payrollModalOpen}
            selectedYm={selectedYm}
            payroll={state.payroll || DEFAULT_PAYROLL}
            accounts={state.accounts}
            onClose={() => setPayrollModalOpen(false)}
            onUpdatePayroll={store.updatePayroll}
          />
        )}

        {syncModalOpen && (
          <SyncModal
            isOpen={syncModalOpen}
            onClose={() => setSyncModalOpen(false)}
            fullState={state}
            onApplyState={store.restoreState}
          />
        )}

        {updatesModalOpen && (
          <UpdatesModal
            isOpen={updatesModalOpen}
            onClose={() => {
              setUpdatesModalOpen(false);
              try {
                const lastSeen = localStorage.getItem('finpay_last_seen_version');
                if (lastSeen === CURRENT_SYSTEM_VERSION) {
                  setHasUnreadUpdates(false);
                }
              } catch {}
            }}
            onNavigateToProfileSettings={handleNavigateToProfileSettings}
          />
        )}
      </Suspense>

      {/* ==================== BARRA DE NAVEGAÇÃO INFERIOR 100% MOBILE ==================== */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 ios-dock safe-bottom-nav px-2 pt-1.5">
        <div className="grid grid-cols-5 gap-1 max-w-md mx-auto">
          {NAV_ITEMS.filter((item) => item.id !== 'settings').map((item) => {
            const IconComp = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { haptic.selection(); setActiveTab(item.id); }}
                className={`py-2 px-1 rounded-2xl flex flex-col items-center justify-center gap-1 transition ${
                  active
                    ? 'bg-neutral-950 text-white font-semibold shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                <IconComp className="w-4 h-4 flex-shrink-0" />
                <span className="text-[10px] leading-none tracking-tight truncate max-w-full">
                  {item.shortTitle}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
export default App;
