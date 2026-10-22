export function formatBRL(value: number, hide = false): string {
  if (hide) return 'R$ •••••';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export function formatCompactBRL(value: number, hide = false): string {
  if (hide) return 'R$ •••';
  if (Math.abs(value) >= 1000) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    }).format(value);
  }
  return formatBRL(value, hide);
}

export function formatPct(value: number, decimals = 2, showSign = false): string {
  const num = Number(value || 0);
  const sign = showSign && num > 0 ? '+' : '';
  return `${sign}${num.toFixed(decimals).replace('.', ',')}%`;
}

export function monthsBetween(fromYm: string, toYm: string): number {
  const [y1, m1] = fromYm.split('-').map(Number);
  const [y2, m2] = toYm.split('-').map(Number);
  if (!y1 || !m1 || !y2 || !m2) return 12;
  return Math.max(1, (y2 - y1) * 12 + (m2 - m1));
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Aceita "1.234,56", "1234,56", "1234.56" e "1.500" (milhar). */
export function parseMoney(input: string): number {
  const s = input.replace(/[^\d.,-]/g, '').trim();
  if (!s) return 0;
  let n: number;
  if (s.includes(',')) n = Number(s.replace(/\./g, '').replace(',', '.'));
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) n = Number(s.replace(/\./g, ''));
  else n = Number(s);
  return Number.isFinite(n) ? round2(n) : 0;
}

export const toInputMoney = (n: number | undefined) =>
  n ? String(round2(n)).replace('.', ',') : '';

export const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
