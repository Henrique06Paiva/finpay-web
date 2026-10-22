import { Frequency } from '../types/finance';

// Todas as datas são strings locais YYYY-MM-DD (nunca toISOString, que usa UTC e
// "pula" para o dia seguinte depois das 21h no horário de Brasília).

export const pad = (n: number) => String(n).padStart(2, '0');

export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const todayISO = () => toISO(new Date());
export const ymOf = (iso: string) => iso.slice(0, 7);
export const currentYM = () => ymOf(todayISO());

export const shiftYM = (ym: string, delta: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

export const daysInMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

export const startOfMonth = (ym: string) => `${ym}-01`;
export const endOfMonth = (ym: string) => `${ym}-${pad(daysInMonth(ym))}`;

export const addDays = (iso: string, n: number) => {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

const clampDate = (y: number, m: number, day: number) => {
  const first = new Date(y, m, 1);
  const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(day, dim));
};

export const addMonths = (iso: string, n: number, anchorDay?: number) => {
  const d = parseISO(iso);
  return toISO(clampDate(d.getFullYear(), d.getMonth() + n, anchorDay ?? d.getDate()));
};

export const diffDays = (from: string, to: string) =>
  Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86400000);

export function advanceDate(iso: string, freq: Frequency, anchorDay: number, dir: 1 | -1 = 1) {
  if (freq === 'weekly') return addDays(iso, 7 * dir);
  if (freq === 'yearly') return addMonths(iso, 12 * dir, anchorDay);
  return addMonths(iso, dir, anchorDay);
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return `${cap(MONTHS[m - 1])} ${y}`;
};

export const monthShort = (ym: string) => cap(MONTHS_SHORT[Number(ym.split('-')[1]) - 1]);

export const formatShortDate = (iso: string) => {
  const d = parseISO(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
};

export const formatLongToday = () => {
  const d = new Date();
  return `${cap(WEEKDAYS[d.getDay()])}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
};

export const formatDayHeader = (iso: string) => {
  const t = todayISO();
  if (iso === t) return 'Hoje';
  if (iso === addDays(t, -1)) return 'Ontem';
  if (iso === addDays(t, 1)) return 'Amanhã';
  const d = parseISO(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${cap(WEEKDAYS[d.getDay()])}, ${d.getDate()} de ${MONTHS[d.getMonth()]}${sameYear ? '' : ` de ${d.getFullYear()}`}`;
};

export const relativeDue = (iso: string) => {
  const n = diffDays(todayISO(), iso);
  if (n < 0) return `Venceu há ${-n} dia${n < -1 ? 's' : ''}`;
  if (n === 0) return 'Vence hoje';
  if (n === 1) return 'Vence amanhã';
  if (n <= 14) return `Vence em ${n} dias`;
  return `Vence ${formatShortDate(iso)}`;
};

export const FREQ_LABEL: Record<Frequency, string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
  yearly: 'Anual',
};

export const isWeekend = (d: Date) => {
  const day = d.getDay();
  return day === 0 || day === 6; // 0 = Domingo, 6 = Sábado
};

/**
 * Calcula o Domingo de Páscoa para um dado ano (Algoritmo de Meeus/Jones/Butcher)
 */
function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = Março, 4 = Abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const holidayCache = new Map<number, Set<string>>();

/**
 * Retorna conjunto de feriados nacionais brasileiros e bancários (FEBRABAN) em formato YYYY-MM-DD
 */
export function getBrazilianHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const fixed = [
    `${year}-01-01`, // Confraternização Universal
    `${year}-04-21`, // Tiradentes
    `${year}-05-01`, // Dia do Trabalhador
    `${year}-09-07`, // Independência do Brasil
    `${year}-10-12`, // Nossa Senhora Aparecida
    `${year}-11-02`, // Finados
    `${year}-11-15`, // Proclamação da República
    `${year}-11-20`, // Dia Nacional de Zumbi e da Consciência Negra
    `${year}-12-25`, // Natal
  ];

  const easter = getEasterSunday(year);
  const offsetEaster = (days: number) => {
    const dt = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() + days);
    return toISO(dt);
  };

  const movable = [
    offsetEaster(-48), // Segunda de Carnaval (feriado bancário FEBRABAN)
    offsetEaster(-47), // Terça de Carnaval (feriado bancário FEBRABAN)
    offsetEaster(-2),  // Sexta-feira Santa (Paixão de Cristo)
    offsetEaster(60),  // Corpus Christi (feriado bancário FEBRABAN)
  ];

  const set = new Set<string>([...fixed, ...movable]);
  holidayCache.set(year, set);
  return set;
}

export const isNationalHoliday = (d: Date): boolean => {
  const holidays = getBrazilianHolidays(d.getFullYear());
  return holidays.has(toISO(d));
};

export const isBusinessDay = (d: Date): boolean => {
  return !isWeekend(d) && !isNationalHoliday(d);
};

/**
 * Retorna o último dia útil bancário do mês (YYYY-MM-DD), retrocedendo se cair em fim de semana ou feriado nacional
 */
export const getLastBusinessDay = (ym: string): string => {
  const dim = daysInMonth(ym);
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1, dim);
  while (!isBusinessDay(d)) {
    d.setDate(d.getDate() - 1);
  }
  return toISO(d);
};

/**
 * Retorna o 5º dia útil bancário do mês (YYYY-MM-DD), considerando fins de semana e feriados nacionais
 */
export const getFifthBusinessDay = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  let count = 0;
  while (count < 5) {
    if (isBusinessDay(d)) {
      count++;
    }
    if (count < 5) {
      d.setDate(d.getDate() + 1);
    }
  }
  return toISO(d);
};

