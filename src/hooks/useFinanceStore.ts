import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Account,
  Bill,
  Category,
  Debt,
  FinanceState,
  MarketIndicators,
  OpenFinanceConsent,
  PayrollConfig,
  Preferences,
  SecuritySettings,
  StrategicGoal,
  Transaction,
} from '../types/finance';
import { createDefaultState, DEFAULT_PAYROLL, PROTECTED_CATEGORY_IDS } from '../data/defaults';
import { fetchLiveMarketIndicators, getCachedMarketData } from '../services/marketService';
import { ParsedBankTransaction } from '../services/openFinanceService';
import { ensurePayrollTransaction } from '../services/payrollService';
import {
  hydrateFinanceStateFromIDB,
  loadInitialFinanceStateSync,
  persistFinanceStateAsync,
  requestPersistentStorage,
} from '../services/storageService';
import {
  calculateInstallmentValue,
  computeAccountBalances,
  computeDebtMetrics,
} from '../utils/analytics';
import { addMonths, advanceDate, todayISO } from '../utils/date';
import { round2 } from '../utils/format';

export function useFinanceStore() {
  const [state, setState] = useState<FinanceState>(() => loadInitialFinanceStateSync());
  const [market, setMarket] = useState<MarketIndicators>(() => getCachedMarketData());
  const [loadingMarket, setLoadingMarket] = useState<boolean>(false);

  // Hidrata do IndexedDB na montagem (caso o histórico no IndexedDB seja maior que o localStorage)
  useEffect(() => {
    requestPersistentStorage();
    let mounted = true;
    hydrateFinanceStateFromIDB().then((idbState) => {
      if (!mounted || !idbState) return;
      setState((current) => {
        // Se o IndexedDB tiver mais registros ou for mais recente, usa o estado do IndexedDB
        const idbCount =
          idbState.transactions.length +
          idbState.debts.length +
          idbState.goals.length +
          idbState.bills.length;
        const curCount =
          current.transactions.length +
          current.debts.length +
          current.goals.length +
          current.bills.length;
        return idbCount >= curCount ? idbState : current;
      });
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Salva assincronamente no IndexedDB + espelho localStorage a cada mudança
  useEffect(() => {
    persistFinanceStateAsync(state);
  }, [state]);

  const updatePayroll = useCallback((nextPayroll: PayrollConfig) => {
    setState((prev) => {
      const currentMonth = todayISO().slice(0, 7);
      const { nextTransactions } = ensurePayrollTransaction(
        nextPayroll,
        currentMonth,
        prev.transactions
      );
      return {
        ...prev,
        payroll: nextPayroll,
        transactions: nextTransactions,
      };
    });
  }, []);

  // Garante que o salário do mês atual esteja sempre sincronizado se payroll estiver habilitado
  useEffect(() => {
    if (state.payroll?.enabled) {
      const currentMonth = todayISO().slice(0, 7);
      const { nextTransactions, updatedOrCreated } = ensurePayrollTransaction(
        state.payroll,
        currentMonth,
        state.transactions
      );
      if (updatedOrCreated) {
        setState((prev) => ({
          ...prev,
          transactions: nextTransactions,
        }));
      }
    }
  }, [state.payroll]);

  const refreshMarket = useCallback(async () => {
    setLoadingMarket(true);
    const live = await fetchLiveMarketIndicators();
    setMarket(live);
    setLoadingMarket(false);
  }, []);

  useEffect(() => {
    refreshMarket();
  }, [refreshMarket]);

  const accountBalances = useMemo(
    () => computeAccountBalances(state.accounts, state.transactions),
    [state.accounts, state.transactions]
  );

  // ==================== AÇÕES: LANÇAMENTOS ====================
  const saveTransaction = useCallback(
    (
      payload: Omit<Transaction, 'id' | 'createdAt'>,
      existingId?: string,
      installmentsCount = 1
    ) => {
      setState((prev) => {
        if (existingId) {
          return {
            ...prev,
            transactions: prev.transactions.map((t) =>
              t.id === existingId ? { ...t, ...payload } : t
            ),
          };
        }

        const totalInst = Math.max(1, Math.min(48, Math.round(installmentsCount)));
        const now = Date.now();

        if (totalInst > 1 && payload.type === 'expense') {
          const groupId = `grp-${now}`;
          const perInstallment = round2(payload.amount / totalInst);
          const createdList: Transaction[] = [];

          for (let i = 0; i < totalInst; i++) {
            const instDate = i === 0 ? payload.date : addMonths(payload.date, i);
            createdList.push({
              ...payload,
              id: `tx-${now}-${i}`,
              amount: perInstallment,
              date: instDate,
              status: i === 0 ? payload.status : 'pending',
              installment: { index: i + 1, total: totalInst, groupId },
              createdAt: now - i,
            });
          }

          return {
            ...prev,
            transactions: [...createdList, ...prev.transactions],
          };
        }

        const created: Transaction = {
          ...payload,
          id: `tx-${now}`,
          createdAt: now,
        };

        const nextGoals =
          created.type === 'investment' && created.goalId
            ? prev.goals.map((g) =>
                g.id === created.goalId
                  ? { ...g, currentAmount: g.currentAmount + created.amount }
                  : g
              )
            : prev.goals;

        return {
          ...prev,
          transactions: [created, ...prev.transactions],
          goals: nextGoals,
        };
      });
    },
    []
  );

  const deleteTransaction = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      transactions: prev.transactions.filter((t) => t.id !== id),
    }));
  }, []);

  const toggleTxStatus = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      transactions: prev.transactions.map((t) =>
        t.id === id ? { ...t, status: t.status === 'paid' ? 'pending' : 'paid' } : t
      ),
    }));
  }, []);

  // ==================== AÇÕES: ORÇAMENTO & CONTAS FIXAS ====================
  const saveBudget = useCallback((categoryId: string, limit: number) => {
    setState((prev) => {
      const others = prev.budgets.filter((b) => b.categoryId !== categoryId);
      if (limit <= 0) return { ...prev, budgets: others };
      return { ...prev, budgets: [...others, { categoryId, limit }] };
    });
  }, []);

  const updateOverallBudget = useCallback((limit: number) => {
    setState((prev) => ({
      ...prev,
      security: { ...prev.security, monthlyOverallBudget: Math.max(0, limit) },
    }));
  }, []);

  const addBill = useCallback((bill: Omit<Bill, 'id' | 'createdAt'>) => {
    setState((prev) => ({
      ...prev,
      bills: [
        ...prev.bills,
        { ...bill, id: `bill-${Date.now()}`, createdAt: Date.now() },
      ],
    }));
  }, []);

  const payBill = useCallback((bill: Bill) => {
    setState((prev) => {
      const paymentTx: Transaction = {
        id: `tx-${Date.now()}`,
        type: 'expense',
        description: bill.name,
        amount: bill.amount,
        date: todayISO(),
        categoryId: bill.categoryId,
        accountId: bill.accountId || prev.accounts[0]?.id || 'principal',
        paymentMethod: bill.paymentMethod,
        status: 'paid',
        tags: ['fixo'],
        billId: bill.id,
        dueRef: bill.nextDue,
        createdAt: Date.now(),
      };

      const nextDueIso = advanceDate(bill.nextDue, bill.frequency, bill.anchorDay, 1);

      return {
        ...prev,
        transactions: [paymentTx, ...prev.transactions],
        bills: prev.bills.map((b) =>
          b.id === bill.id ? { ...b, nextDue: nextDueIso } : b
        ),
      };
    });
  }, []);

  const deleteBill = useCallback((billId: string) => {
    setState((prev) => ({
      ...prev,
      bills: prev.bills.filter((b) => b.id !== billId),
    }));
  }, []);

  const dismissSuggestion = useCallback((key: string) => {
    setState((prev) => ({
      ...prev,
      prefs: {
        ...prev.prefs,
        dismissedSuggestions: [...prev.prefs.dismissedSuggestions, key],
      },
    }));
  }, []);

  // ==================== AÇÕES: CONTROLE DE DÍVIDAS ====================
  const addDebt = useCallback((debt: Omit<Debt, 'id' | 'createdAt'>) => {
    setState((prev) => ({
      ...prev,
      debts: [
        ...prev.debts,
        { ...debt, id: `debt-${Date.now()}`, createdAt: Date.now() },
      ],
    }));
  }, []);

  const payDebtInstallment = useCallback((debt: Debt) => {
    setState((prev) => {
      const metrics = computeDebtMetrics(debt);
      const nextInstallmentNumber = debt.paidInstallments + 1;
      const newBalance = Math.max(0, round2(debt.currentBalance - metrics.nextMonthPrincipal));
      const newPaidInstallments = Math.min(
        debt.totalInstallments,
        debt.paidInstallments + 1
      );
      const remainingAfter = Math.max(1, debt.totalInstallments - newPaidInstallments);

      const nextMonthlyPayment =
        newBalance <= 0.01
          ? 0
          : debt.amortizationSystem === 'sac'
          ? calculateInstallmentValue(
              newBalance,
              debt.monthlyInterestRate,
              remainingAfter,
              'sac'
            )
          : debt.monthlyPayment;

      const paymentTx: Transaction = {
        id: `tx-${Date.now()}`,
        type: 'expense',
        description: `${debt.name} (Parcela ${nextInstallmentNumber}/${debt.totalInstallments})`,
        amount: debt.monthlyPayment,
        date: todayISO(),
        categoryId: 'dividas',
        accountId: debt.accountId || prev.accounts[0]?.id || 'principal',
        paymentMethod: 'boleto',
        status: 'paid',
        tags: ['divida', 'parcela'],
        notes: `Amortização: R$ ${metrics.nextMonthPrincipal.toFixed(2)} | Juros: R$ ${metrics.nextMonthInterest.toFixed(2)}`,
        createdAt: Date.now(),
      };

      return {
        ...prev,
        transactions: [paymentTx, ...prev.transactions],
        debts: prev.debts.map((d) =>
          d.id === debt.id
            ? {
                ...d,
                currentBalance: newBalance,
                paidInstallments: newPaidInstallments,
                monthlyPayment: nextMonthlyPayment,
              }
            : d
        ),
      };
    });
  }, []);

  const amortizeDebt = useCallback(
    (debtId: string, extraAmount: number, mode: 'reduce_term' | 'reduce_payment') => {
      setState((prev) => {
        const target = prev.debts.find((d) => d.id === debtId);
        if (!target || extraAmount <= 0) return prev;

        const appliedAmount = Math.min(target.currentBalance, extraAmount);
        const newBalance = Math.max(0, round2(target.currentBalance - appliedAmount));
        const currentRemaining = Math.max(
          1,
          target.totalInstallments - target.paidInstallments
        );

        let newTotalInstallments = target.totalInstallments;
        let newMonthlyPayment = target.monthlyPayment;

        if (newBalance <= 0.01) {
          newTotalInstallments = target.paidInstallments;
          newMonthlyPayment = 0;
        } else if (mode === 'reduce_term') {
          const r = target.monthlyInterestRate / 100;
          if (r > 0 && target.monthlyPayment > newBalance * r) {
            const n = Math.ceil(
              -Math.log(1 - (newBalance * r) / target.monthlyPayment) / Math.log(1 + r)
            );
            newTotalInstallments = target.paidInstallments + Math.max(1, n);
          } else {
            const n = Math.max(1, Math.ceil(newBalance / Math.max(1, target.monthlyPayment)));
            newTotalInstallments = target.paidInstallments + n;
          }
        } else {
          newMonthlyPayment = calculateInstallmentValue(
            newBalance,
            target.monthlyInterestRate,
            currentRemaining,
            target.amortizationSystem
          );
        }

        const amortTx: Transaction = {
          id: `tx-${Date.now()}`,
          type: 'expense',
          description: `Amortização extra: ${target.name}`,
          amount: appliedAmount,
          date: todayISO(),
          categoryId: 'dividas',
          accountId: target.accountId || prev.accounts[0]?.id || 'principal',
          paymentMethod: 'pix',
          status: 'paid',
          tags: ['divida', 'amortizacao'],
          notes:
            mode === 'reduce_term'
              ? 'Amortização extraordinária para reduzir prazo'
              : 'Amortização extraordinária para reduzir valor da parcela',
          createdAt: Date.now(),
        };

        return {
          ...prev,
          transactions: [amortTx, ...prev.transactions],
          debts: prev.debts.map((d) =>
            d.id === debtId
              ? {
                  ...d,
                  currentBalance: newBalance,
                  totalInstallments: newTotalInstallments,
                  monthlyPayment: newMonthlyPayment,
                }
              : d
          ),
        };
      });
    },
    []
  );

  const deleteDebt = useCallback((debtId: string) => {
    setState((prev) => ({
      ...prev,
      debts: prev.debts.filter((d) => d.id !== debtId),
    }));
  }, []);

  // ==================== AÇÕES: METAS FINANCEIRAS ====================
  const addGoal = useCallback((goal: Omit<StrategicGoal, 'id'>) => {
    setState((prev) => ({
      ...prev,
      goals: [
        ...prev.goals,
        { ...goal, id: `goal-${Date.now()}`, createdAt: Date.now() },
      ],
    }));
  }, []);

  const contributeGoal = useCallback((goalId: string, amount: number) => {
    setState((prev) => {
      const target = prev.goals.find((g) => g.id === goalId);
      const tx: Transaction = {
        id: `tx-${Date.now()}`,
        type: 'investment',
        description: `Aporte: ${target?.title || 'Meta'}`,
        amount,
        date: todayISO(),
        accountId: prev.accounts[0]?.id || 'principal',
        paymentMethod: 'transfer',
        status: 'paid',
        tags: ['meta'],
        goalId,
        createdAt: Date.now(),
      };

      return {
        ...prev,
        transactions: [tx, ...prev.transactions],
        goals: prev.goals.map((g) =>
          g.id === goalId ? { ...g, currentAmount: g.currentAmount + amount } : g
        ),
      };
    });
  }, []);

  const deleteGoal = useCallback((goalId: string) => {
    setState((prev) => ({
      ...prev,
      goals: prev.goals.filter((g) => g.id !== goalId),
    }));
  }, []);

  // ==================== AÇÕES: CONFIGURAÇÕES & CONTAS ====================
  const updatePrefs = useCallback((prefs: Preferences) => {
    setState((prev) => ({ ...prev, prefs }));
  }, []);

  const addAccount = useCallback((acc: Omit<Account, 'id'>) => {
    setState((prev) => ({
      ...prev,
      accounts: [...prev.accounts, { ...acc, id: `acc-${Date.now()}` }],
    }));
  }, []);

  const updateAccountBalance = useCallback((accountId: string, newInitialBalance: number) => {
    setState((prev) => ({
      ...prev,
      accounts: prev.accounts.map((a) =>
        a.id === accountId ? { ...a, initialBalance: newInitialBalance } : a
      ),
    }));
  }, []);

  const deleteAccount = useCallback((accountId: string) => {
    setState((prev) => ({
      ...prev,
      accounts: prev.accounts.filter((a) => a.id !== accountId),
    }));
  }, []);

  const addCategory = useCallback((cat: Omit<Category, 'id'>) => {
    setState((prev) => ({
      ...prev,
      categories: [...prev.categories, { ...cat, id: `cat-${Date.now()}` }],
    }));
  }, []);

  const deleteCategory = useCallback((catId: string) => {
    if (PROTECTED_CATEGORY_IDS.includes(catId)) return;
    setState((prev) => ({
      ...prev,
      categories: prev.categories.filter((c) => c.id !== catId),
    }));
  }, []);

  const updateSecurity = useCallback((next: SecuritySettings) => {
    setState((prev) => ({ ...prev, security: next }));
  }, []);

  const restoreState = useCallback((restored: Partial<FinanceState>) => {
    setState((prev) => ({
      ...prev,
      ...restored,
      version: 3,
    }));
  }, []);

  const resetAll = useCallback(() => {
    setState(createDefaultState());
  }, []);

  // ==================== AÇÕES: OPEN FINANCE ====================
  const createOpenFinanceConsent = useCallback(
    (
      consentPayload: Omit<OpenFinanceConsent, 'id' | 'importedCount'>,
      newAccountIfNeeded?: { name: string; color: string }
    ): string => {
      let targetAccId = consentPayload.accountId;
      const createdAccId = `acc-of-${Date.now()}`;

      if (!targetAccId && newAccountIfNeeded) {
        targetAccId = createdAccId;
      } else if (!targetAccId) {
        targetAccId = state.accounts[0]?.id || 'principal';
      }

      const newConsent: OpenFinanceConsent = {
        ...consentPayload,
        id: `consent-${Date.now()}`,
        accountId: targetAccId,
        importedCount: 0,
      };

      setState((prev) => {
        const nextAccounts =
          !consentPayload.accountId && newAccountIfNeeded
            ? [
                ...prev.accounts,
                {
                  id: createdAccId,
                  name: newAccountIfNeeded.name,
                  type: 'checking' as const,
                  initialBalance: 0,
                  color: newAccountIfNeeded.color,
                },
              ]
            : prev.accounts;

        const currentConsents = prev.prefs.openFinanceConsents || [];
        return {
          ...prev,
          accounts: nextAccounts,
          prefs: {
            ...prev.prefs,
            openFinanceConsents: [newConsent, ...currentConsents],
          },
        };
      });

      return targetAccId;
    },
    [state.accounts]
  );

  const revokeOpenFinanceConsent = useCallback((consentId: string) => {
    setState((prev) => ({
      ...prev,
      prefs: {
        ...prev.prefs,
        openFinanceConsents: (prev.prefs.openFinanceConsents || []).map((c) =>
          c.id === consentId ? { ...c, status: 'REVOKED' as const } : c
        ),
      },
    }));
  }, []);

  const importOpenFinanceTransactions = useCallback(
    (
      consentId: string | undefined,
      accountId: string,
      items: ParsedBankTransaction[]
    ) => {
      setState((prev) => {
        const now = Date.now();
        const importedTxs: Transaction[] = items.map((item, idx) => ({
          id: `tx-of-${now}-${idx}`,
          type: item.type,
          description: item.description,
          amount: item.amount,
          date: item.date,
          categoryId: item.categoryId,
          accountId: accountId || prev.accounts[0]?.id || 'principal',
          paymentMethod: item.paymentMethod,
          status: 'paid',
          tags: ['open-finance'],
          externalId: item.externalId,
          openFinanceConsentId: consentId,
          createdAt: now - idx,
        }));

        const nextConsents = (prev.prefs.openFinanceConsents || []).map((c) =>
          c.id === consentId
            ? {
                ...c,
                lastSyncAt: todayISO(),
                importedCount: c.importedCount + importedTxs.length,
              }
            : c
        );

        return {
          ...prev,
          transactions: [...importedTxs, ...prev.transactions],
          prefs: {
            ...prev.prefs,
            openFinanceConsents: nextConsents,
          },
        };
      });
    },
    []
  );

  return {
    state,
    market,
    loadingMarket,
    accountBalances,
    refreshMarket,
    // Lançamentos
    saveTransaction,
    deleteTransaction,
    toggleTxStatus,
    // Orçamento & Fixas
    saveBudget,
    updateOverallBudget,
    addBill,
    payBill,
    deleteBill,
    dismissSuggestion,
    // Dívidas
    addDebt,
    payDebtInstallment,
    amortizeDebt,
    deleteDebt,
    // Metas
    addGoal,
    contributeGoal,
    deleteGoal,
    // Configurações
    updatePrefs,
    addAccount,
    updateAccountBalance,
    deleteAccount,
    addCategory,
    deleteCategory,
    updateSecurity,
    restoreState,
    resetAll,
    // Open Finance
    createOpenFinanceConsent,
    revokeOpenFinanceConsent,
    importOpenFinanceTransactions,
    // Holerite CLT
    updatePayroll,
  };
}
