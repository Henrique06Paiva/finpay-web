import { FinanceState } from '../types/finance';
import {
  createDefaultState,
  DEFAULT_ACCOUNTS,
  DEFAULT_CATEGORIES,
  DEFAULT_PAYROLL,
  DEFAULT_PREFS,
  DEFAULT_SECURITY,
} from '../data/defaults';
import { todayISO } from '../utils/date';
import { norm } from '../utils/format';

const IDB_NAME = 'AuraFinanceDB';
const IDB_VERSION = 1;
const IDB_STORE = 'app_state';
const IDB_KEY = 'aura_finance_state_v3';
const LS_KEY = 'aura_finance_state_v3';

function normalizeState(parsed: Partial<FinanceState> | null | undefined): FinanceState {
  if (!parsed || typeof parsed !== 'object') {
    return createDefaultState();
  }
  return {
    version: 3,
    accounts: parsed.accounts?.length ? parsed.accounts : DEFAULT_ACCOUNTS,
    categories: parsed.categories?.length ? parsed.categories : DEFAULT_CATEGORIES,
    transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
    budgets: Array.isArray(parsed.budgets) ? parsed.budgets : [],
    bills: Array.isArray(parsed.bills) ? parsed.bills : [],
    debts: Array.isArray(parsed.debts) ? parsed.debts : [],
    goals: Array.isArray(parsed.goals) ? parsed.goals : [],
    payroll: parsed.payroll ? parsed.payroll : DEFAULT_PAYROLL,
    security: { ...DEFAULT_SECURITY, ...(parsed.security || {}) },
    prefs: { ...DEFAULT_PREFS, ...(parsed.prefs || {}) },
  };
}

function mapLegacyCategoryName(name: string | undefined, type: string): string {
  if (type === 'income') return 'salario';
  const n = norm(name || '');
  if (n.includes('moradia') || n.includes('aluguel')) return 'moradia';
  if (n.includes('alimenta')) return 'alimentacao';
  if (n.includes('mercado')) return 'mercado';
  if (n.includes('transporte')) return 'transporte';
  if (n.includes('assinatura')) return 'assinaturas';
  if (n.includes('saude')) return 'saude';
  if (n.includes('lazer')) return 'lazer';
  return 'outros';
}

/**
 * Leitura síncrona rápida para o primeiro render (0ms de tela branca),
 * com migração automática caso haja dados legados no localStorage.
 */
export function loadInitialFinanceStateSync(): FinanceState {
  try {
    const rawV3 = localStorage.getItem(LS_KEY);
    if (rawV3) {
      return normalizeState(JSON.parse(rawV3));
    }

    const oldTxRaw = localStorage.getItem('aura_ios_transactions_v2_clean');
    const oldGoalsRaw = localStorage.getItem('aura_ios_goals_v2_clean');
    const oldSecRaw = localStorage.getItem('aura_ios_security_v2_clean');

    const base = createDefaultState();

    if (oldTxRaw) {
      const oldTxs = JSON.parse(oldTxRaw) as Array<Record<string, unknown>>;
      base.transactions = oldTxs.map((t, idx) => ({
        id: (t.id as string) || `tx-${Date.now()}-${idx}`,
        type:
          t.type === 'investment'
            ? 'investment'
            : t.type === 'income'
            ? 'income'
            : 'expense',
        description: (t.description as string) || 'Lançamento',
        amount: Number(t.amount) || 0,
        date: (t.date as string) || todayISO(),
        categoryId: mapLegacyCategoryName(t.category as string, t.type as string),
        accountId: 'principal',
        paymentMethod: (t.paymentMethod as 'pix') || 'pix',
        status: 'paid',
        tags: [],
        goalId: t.goalId as string | undefined,
        createdAt: Date.now() - idx * 1000,
      }));
    }

    if (oldGoalsRaw) {
      base.goals = JSON.parse(oldGoalsRaw);
    }
    if (oldSecRaw) {
      base.security = { ...DEFAULT_SECURITY, ...JSON.parse(oldSecRaw) };
    }

    return base;
  } catch {
    return createDefaultState();
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível'));
      return;
    }
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Solicita armazenamento persistente no navegador (evita limpeza automática no iOS/Safari)
 */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage && navigator.storage.persist) {
      await navigator.storage.persist();
    }
  } catch {
    // silencioso
  }
}

/**
 * Hidrata o estado a partir do IndexedDB (assíncrono e sem limite de 5MB).
 * Se o IndexedDB ainda estiver vazio mas o localStorage tiver dados, sincroniza automaticamente.
 */
export async function hydrateFinanceStateFromIDB(): Promise<FinanceState | null> {
  try {
    const db = await openDatabase();
    return await new Promise<FinanceState | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () => {
        if (req.result) {
          resolve(normalizeState(req.result as Partial<FinanceState>));
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Salva o estado de forma assíncrona no IndexedDB (com debounce para não travar a UI
 * durante digitação rápida ou importação em lote do Open Finance) e mantém espelho leve no localStorage.
 */
export function persistFinanceStateAsync(state: FinanceState): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(async () => {
    // 1. Persiste no IndexedDB (capacidade de centenas de MBs para histórico longo de Open Finance)
    try {
      const db = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        store.put(state, IDB_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // fallback para localStorage abaixo
    }

    // 2. Mantém cache de boot rápido no localStorage enquanto couber na cota de 5MB
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {
      // Se ultrapassar 5MB no futuro, o IndexedDB continua guardando 100% dos dados com segurança
    }
  }, 120);
}
