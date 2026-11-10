import { describe, expect, it, beforeEach } from 'vitest';
import { CURRENT_SYSTEM_VERSION } from '../data/version';

// Shim para ambiente Node no Vitest
const createMemoryStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

describe('Sistema de Notificação de Atualizações & Novidades', () => {
  const memoryStorage = createMemoryStorage();

  beforeEach(() => {
    memoryStorage.clear();
  });

  it('deve ter uma versão do sistema definida válida no padrão semver', () => {
    expect(CURRENT_SYSTEM_VERSION).toBeDefined();
    expect(CURRENT_SYSTEM_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('deve indicar atualização não lida se o usuário nunca abriu as novidades', () => {
    const lastSeen = memoryStorage.getItem('finpay_last_seen_version');
    const hasUnread = lastSeen !== CURRENT_SYSTEM_VERSION;
    expect(hasUnread).toBe(true);
  });

  it('deve indicar atualização não lida se o usuário visualizou uma versão antiga', () => {
    memoryStorage.setItem('finpay_last_seen_version', '2.0.0');
    const lastSeen = memoryStorage.getItem('finpay_last_seen_version');
    const hasUnread = lastSeen !== CURRENT_SYSTEM_VERSION;
    expect(hasUnread).toBe(true);
  });

  it('deve considerar lido quando a versão atual for salva no storage', () => {
    memoryStorage.setItem('finpay_last_seen_version', CURRENT_SYSTEM_VERSION);
    const lastSeen = memoryStorage.getItem('finpay_last_seen_version');
    const hasUnread = lastSeen !== CURRENT_SYSTEM_VERSION;
    expect(hasUnread).toBe(false);
  });
});
