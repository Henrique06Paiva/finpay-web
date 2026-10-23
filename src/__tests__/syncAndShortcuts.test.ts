import { describe, it, expect } from 'vitest';
import {
  buildSyncPayload,
  mergeSyncPayload,
  parseSiriShortcutUrl,
} from '../services/syncService';
import { createDefaultState } from '../data/defaults';

describe('Cross-Platform Sync & Siri Shortcuts Suite', () => {
  it('deve extrair parâmetros de URL para comando de voz da Siri com sucesso', () => {
    const urlSearch = '?add=expense&val=45.90&desc=Almoco%20Executivo&cat=alimentacao';
    const parsed = parseSiriShortcutUrl(urlSearch);

    expect(parsed).not.toBeNull();
    expect(parsed?.action).toBe('add_tx');
    expect(parsed?.type).toBe('expense');
    expect(parsed?.amount).toBe(45.9);
    expect(parsed?.description).toBe('Almoco Executivo');
    expect(parsed?.category).toBe('alimentacao');
  });

  it('deve identificar navegação direta para abas via Atalho', () => {
    const urlSearch = '?tab=debts';
    const parsed = parseSiriShortcutUrl(urlSearch);

    expect(parsed).not.toBeNull();
    expect(parsed?.action).toBe('view_tab');
    expect(parsed?.tab).toBe('debts');
  });

  it('deve construir payload interoperável para QR Code entre iPhone e Android', () => {
    const state = createDefaultState();
    const payload = buildSyncPayload(state);

    expect(payload.protocol).toBe('finpay_sync_v1');
    expect(payload.sourceDevice).toBe('iOS_PWA');
    expect(payload.accounts.length).toBeGreaterThan(0);
    expect(payload.summary.accountsCount).toBe(payload.accounts.length);
  });

  it('deve mesclar dados escaneados do Android no estado do iPhone sem duplicatas', () => {
    const state = createDefaultState();
    const mockAndroidPayload = {
      protocol: 'finpay_sync_v1' as const,
      exportedAt: new Date().toISOString(),
      sourceDevice: 'Android_NDK' as const,
      summary: { accountsCount: 1, transactionsCount: 1, debtsCount: 1, goalsCount: 1 },
      accounts: [
        { id: 'acc_pax_1', name: 'Caixa POS PAX A910', balance: 1250.0 },
      ],
      transactions: [
        {
          id: 'tx_pax_99',
          title: 'Venda Débito POS',
          category: 'vendas',
          date: '2026-10-23',
          amount: 150.0,
          isIncome: true,
        },
      ],
      debts: [],
      goals: [],
    };

    const merged = mergeSyncPayload(state, mockAndroidPayload);

    expect(merged.accounts.some((a) => a.name === 'Caixa POS PAX A910')).toBe(true);
    expect(merged.transactions.some((t) => t.id === 'tx_pax_99')).toBe(true);
  });
});
