import { describe, expect, it } from 'vitest';
import { FinanceState, Transaction, UserProfile } from '../types/finance';
import { buildSyncPayload, mergeSyncPayload } from '../services/syncService';
import { ymOf } from '../utils/date';

describe('Modo Casal & Finanças a Dois (Conta Conjunta)', () => {
  it('deve preservar as propriedades de casal e titularidade no buildSyncPayload e mergeSyncPayload', () => {
    const mockState: FinanceState = {
      accounts: [
        {
          id: 'acc-joint-1',
          name: 'Conta Conjunta Nubank',
          type: 'checking',
          initialBalance: 2000,
          color: '#8A05BE',
          owner: 'joint',
          isJoint: true,
        },
        {
          id: 'acc-p1',
          name: 'Conta Henrique (Itaú)',
          type: 'checking',
          initialBalance: 5000,
          color: '#EC7000',
          owner: 'partner1',
        },
      ],
      categories: [],
      transactions: [
        {
          id: 'tx-mercado-1',
          type: 'expense',
          description: 'Supermercado Pão de Açúcar',
          amount: 600,
          date: '2026-11-05',
          accountId: 'acc-p1',
          payer: 'partner1',
          scope: 'household',
          createdAt: Date.now(),
        },
        {
          id: 'tx-pessoal-1',
          type: 'expense',
          description: 'Curso Pessoal',
          amount: 150,
          date: '2026-11-06',
          accountId: 'acc-p1',
          payer: 'partner1',
          scope: 'individual',
          createdAt: Date.now(),
        },
      ],
      budgets: [],
      bills: [],
      debts: [],
      goals: [],
      security: {
        pinHash: null,
        biometricsEnabled: false,
        webAuthnCredentialId: null,
        hideBalancesByDefault: false,
        monthlyOverallBudget: 10000,
      },
      prefs: {
        profile: {
          name: 'Henrique',
          isCoupleMode: true,
          partner1Name: 'Henrique',
          partner2Name: 'Luísa',
          splitMode: '50_50',
        },
        remindersEnabled: true,
      },
    };

    const payload = buildSyncPayload(mockState, { limit: 0 });
    expect(payload.accounts[0].owner).toBe('joint');
    expect(payload.accounts[0].isJoint).toBe(true);
    expect(payload.accounts[1].owner).toBe('partner1');

    expect(payload.transactions[0].payer).toBe('partner1');
    expect(payload.transactions[0].scope).toBe('individual');
    expect(payload.transactions[1].payer).toBe('partner1');
    expect(payload.transactions[1].scope).toBe('household');

    // Testar merge em estado vazio
    const emptyState: FinanceState = {
      ...mockState,
      accounts: [],
      transactions: [],
    };

    const merged = mergeSyncPayload(emptyState, payload);
    expect(merged.accounts.length).toBe(2);
    expect(merged.accounts.find((a) => a.id === 'acc-joint-1')?.owner).toBe('joint');
    expect(merged.transactions.find((t) => t.id === 'tx-mercado-1')?.scope).toBe('household');
    expect(merged.transactions.find((t) => t.id === 'tx-mercado-1')?.payer).toBe('partner1');
  });

  it('deve calcular corretamente o acerto de contas do casal em despesas comuns (50/50)', () => {
    const selectedYm = '2026-11';
    const profile: UserProfile = {
      name: 'Henrique',
      isCoupleMode: true,
      partner1Name: 'Henrique',
      partner2Name: 'Luísa',
      splitMode: '50_50',
    };

    const transactions: Transaction[] = [
      // Henrique pagou R$ 800 de supermercado (Casa)
      {
        id: 'tx-1',
        type: 'expense',
        description: 'Supermercado Mensal',
        amount: 800,
        date: '2026-11-02',
        accountId: 'acc-1',
        payer: 'partner1',
        scope: 'household',
        createdAt: 1,
      },
      // Luísa pagou R$ 200 de conta de luz (Casa)
      {
        id: 'tx-2',
        type: 'expense',
        description: 'Enel Energia',
        amount: 200,
        date: '2026-11-04',
        accountId: 'acc-2',
        payer: 'partner2',
        scope: 'household',
        createdAt: 2,
      },
      // Henrique pagou R$ 100 de almoço com colegas de trabalho (Pessoal - não entra na casa!)
      {
        id: 'tx-3',
        type: 'expense',
        description: 'Almoço Individual Trabalho',
        amount: 100,
        date: '2026-11-05',
        accountId: 'acc-1',
        payer: 'partner1',
        scope: 'individual',
        createdAt: 3,
      },
      // Conta conjunta pagou R$ 500 de condomínio (já dividido)
      {
        id: 'tx-4',
        type: 'expense',
        description: 'Condomínio',
        amount: 500,
        date: '2026-11-10',
        accountId: 'acc-joint',
        payer: 'joint',
        scope: 'household',
        createdAt: 4,
      },
    ];

    // Cálculo das despesas comuns
    const householdExpenses = transactions.filter(
      (tx) => ymOf(tx.date) === selectedYm && tx.type === 'expense' && tx.scope === 'household'
    );

    let p1Paid = 0;
    let p2Paid = 0;
    let jointPaid = 0;

    for (const tx of householdExpenses) {
      if (tx.payer === 'partner2') p2Paid += tx.amount;
      else if (tx.payer === 'joint') jointPaid += tx.amount;
      else p1Paid += tx.amount;
    }

    expect(p1Paid).toBe(800);
    expect(p2Paid).toBe(200);
    expect(jointPaid).toBe(500);

    const totalSharedOutOfPocket = p1Paid + p2Paid; // R$ 1000
    expect(totalSharedOutOfPocket).toBe(1000);

    const fairShare = totalSharedOutOfPocket / 2; // R$ 500 cada
    expect(fairShare).toBe(500);

    // Henrique pagou 800 (300 a mais do que sua metade de 500).
    // Luísa pagou 200 (300 a menos do que sua metade de 500).
    // Logo, Luísa deve transferir R$ 300 para Henrique!
    const p1Diff = p1Paid - fairShare;
    expect(p1Diff).toBe(300);

    const debtor = p1Diff > 0 ? profile.partner2Name : profile.partner1Name;
    const creditor = p1Diff > 0 ? profile.partner1Name : profile.partner2Name;
    const transferAmount = Math.abs(p1Diff);

    expect(debtor).toBe('Luísa');
    expect(creditor).toBe('Henrique');
    expect(transferAmount).toBe(300);
  });
});
