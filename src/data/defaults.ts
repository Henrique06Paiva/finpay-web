import {
  Account,
  AccountType,
  AmortizationSystem,
  BenchmarkType,
  Category,
  DebtKind,
  FinanceState,
  PaymentMethod,
  PayrollConfig,
  Preferences,
  SecuritySettings,
  StrategicGoal,
} from '../types/finance';

export const DEFAULT_CATEGORIES: Category[] = [
  // Despesas
  { id: 'moradia', name: 'Moradia', kind: 'expense', icon: 'Home', color: '#55657A' },
  { id: 'contas', name: 'Contas & Serviços', kind: 'expense', icon: 'Zap', color: '#B8892E' },
  { id: 'mercado', name: 'Mercado', kind: 'expense', icon: 'ShoppingCart', color: '#4F7F5A' },
  { id: 'alimentacao', name: 'Alimentação', kind: 'expense', icon: 'Utensils', color: '#C0643F' },
  { id: 'transporte', name: 'Transporte', kind: 'expense', icon: 'Car', color: '#3F6E9A' },
  { id: 'saude', name: 'Saúde', kind: 'expense', icon: 'HeartPulse', color: '#B04A5A' },
  { id: 'educacao', name: 'Educação', kind: 'expense', icon: 'GraduationCap', color: '#6A5AA8' },
  { id: 'lazer', name: 'Lazer', kind: 'expense', icon: 'Ticket', color: '#8E5BA6' },
  { id: 'compras', name: 'Compras', kind: 'expense', icon: 'ShoppingBag', color: '#C2577D' },
  { id: 'assinaturas', name: 'Assinaturas', kind: 'expense', icon: 'Repeat', color: '#2F7F86' },
  { id: 'dividas', name: 'Dívidas & Parcelas', kind: 'expense', icon: 'Receipt', color: '#8C3B3B' },
  { id: 'pets', name: 'Pets', kind: 'expense', icon: 'PawPrint', color: '#8A6E4B' },
  { id: 'viagem', name: 'Viagem', kind: 'expense', icon: 'Plane', color: '#2E86AB' },
  { id: 'impostos', name: 'Impostos & Taxas', kind: 'expense', icon: 'Receipt', color: '#7A7A7A' },
  { id: 'outros', name: 'Outros', kind: 'expense', icon: 'MoreHorizontal', color: '#A3A3A3' },
  // Receitas
  { id: 'salario', name: 'Salário', kind: 'income', icon: 'Briefcase', color: '#2F7D4F' },
  { id: 'freelance', name: 'Freelance', kind: 'income', icon: 'Laptop', color: '#3D8A73' },
  { id: 'rendimentos', name: 'Rendimentos', kind: 'income', icon: 'TrendingUp', color: '#5B8C2A' },
  { id: 'reembolso', name: 'Reembolso', kind: 'income', icon: 'RotateCcw', color: '#4C7EA8' },
  { id: 'presente', name: 'Presente', kind: 'income', icon: 'Gift', color: '#B5577A' },
  { id: 'outras_receitas', name: 'Outras receitas', kind: 'income', icon: 'PlusCircle', color: '#6E8F7E' },
];

/** Categorias que nunca podem ser removidas (usadas como destino ao apagar outras) */
export const PROTECTED_CATEGORY_IDS = ['outros', 'outras_receitas'];

export const DEFAULT_ACCOUNTS: Account[] = [
  { id: 'principal', name: 'Conta principal', type: 'checking', initialBalance: 0, color: '#111111' },
  { id: 'carteira', name: 'Carteira', type: 'wallet', initialBalance: 0, color: '#8A6E4B' },
];

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  wallet: 'Dinheiro',
  credit: 'Cartão de crédito',
  investment: 'Investimentos',
};

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  pix: 'Pix',
  debit: 'Débito',
  credit: 'Crédito',
  cash: 'Dinheiro',
  transfer: 'Transferência',
  boleto: 'Boleto',
};

export const DEBT_KIND_LABEL: Record<DebtKind, string> = {
  loan: 'Empréstimo Pessoal',
  financing: 'Financiamento (Auto / Imóvel)',
  credit_card: 'Cartão Parcelado / Rotativo',
  consigned: 'Consignado',
  overdraft: 'Cheque Especial / Limite',
  other: 'Outra Dívida',
};

export const AMORTIZATION_LABEL: Record<AmortizationSystem, string> = {
  price: 'Tabela Price (Parcela Fixa)',
  sac: 'SAC (Parcela Decrescente)',
  fixed: 'Parcelado Simples',
};

export const PALETTE = [
  '#111111', '#55657A', '#3F6E9A', '#2E86AB', '#2F7F86', '#4F7F5A', '#5B8C2A',
  '#B8892E', '#C0643F', '#B04A5A', '#C2577D', '#8E5BA6', '#6A5AA8', '#8A6E4B',
];

export const CATEGORY_ICON_CHOICES = [
  'Home', 'Zap', 'ShoppingCart', 'Utensils', 'Coffee', 'Car', 'Fuel', 'HeartPulse', 'Dumbbell',
  'GraduationCap', 'Ticket', 'ShoppingBag', 'Shirt', 'Repeat', 'Smartphone', 'PawPrint', 'Baby',
  'Plane', 'Receipt', 'Gift', 'Briefcase', 'Laptop', 'TrendingUp', 'Wallet', 'MoreHorizontal',
];

export const GOAL_ICON_CHOICES = ['ShieldCheck', 'Plane', 'Laptop', 'Car', 'Heart', 'Home', 'GraduationCap', 'Target'];

export const BENCHMARK_INFO: Record<BenchmarkType, { label: string; asset: string }> = {
  TESOURO_SELIC: {
    label: 'Resgate imediato · Tesouro Selic',
    asset: 'Tesouro Selic ou CDB 100% do CDI com liquidez diária em banco sólido.',
  },
  '100_CDI': {
    label: 'CDB 100% do CDI',
    asset: 'CDB 100% do CDI com liquidez diária (Nubank, Itaú, BTG, Inter).',
  },
  '110_CDI': {
    label: 'Prazo definido · LCI/LCA ou CDB 110%',
    asset: 'LCI/LCA isenta de IR (92%+ do CDI) ou CDB 110% do CDI com vencimento perto da data da meta.',
  },
  IPCA_PLUS_6: {
    label: 'Longo prazo · Tesouro IPCA+',
    asset: 'Tesouro IPCA+ com vencimento alinhado ao prazo, protegendo da inflação.',
  },
  POUPANCA: {
    label: 'Poupança',
    asset: 'Considere migrar para o Tesouro Selic: mesma segurança e rendimento maior.',
  },
};

export interface GoalTemplate {
  key: string;
  title: string;
  subtitle: string;
  icon: string;
  targetAmount: number;
  months: number;
  benchmark: BenchmarkType;
  priority: StrategicGoal['priority'];
}

export const GOAL_TEMPLATES: GoalTemplate[] = [
  { key: 'reserva', title: 'Reserva de emergência', subtitle: '6 meses do seu custo de vida', icon: 'ShieldCheck', targetAmount: 15000, months: 12, benchmark: 'TESOURO_SELIC', priority: 'Essencial' },
  { key: 'viagem', title: 'Viagem', subtitle: 'Passagens, hospedagem e passeios', icon: 'Plane', targetAmount: 8000, months: 10, benchmark: '110_CDI', priority: 'Média' },
  { key: 'computador', title: 'Computador novo', subtitle: 'Compra à vista com desconto', icon: 'Laptop', targetAmount: 9000, months: 8, benchmark: '100_CDI', priority: 'Média' },
  { key: 'carro', title: 'Carro', subtitle: 'Entrada ou compra sem financiamento', icon: 'Car', targetAmount: 40000, months: 24, benchmark: '110_CDI', priority: 'Alta' },
  { key: 'casamento', title: 'Casamento', subtitle: 'Cerimônia, festa e lua de mel', icon: 'Heart', targetAmount: 50000, months: 20, benchmark: '110_CDI', priority: 'Alta' },
];

export const DEFAULT_SECURITY: SecuritySettings = {
  pinHash: null,
  biometricsEnabled: false,
  webAuthnCredentialId: null,
  hideBalancesByDefault: false,
  monthlyOverallBudget: 0,
};

export const DEFAULT_PREFS: Preferences = {
  remindersEnabled: false,
  dismissedSuggestions: [],
};

export const DEFAULT_PAYROLL: PayrollConfig = {
  enabled: false,
  employerName: '',
  role: '',
  grossSalary: 0,
  deductions: [],
  payDayRule: 'last_business_day',
  accountId: 'principal',
};

export function createDefaultState(): FinanceState {
  return {
    version: 3,
    accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a })),
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    transactions: [],
    budgets: [],
    bills: [],
    debts: [],
    goals: [],
    payroll: { ...DEFAULT_PAYROLL, deductions: [...DEFAULT_PAYROLL.deductions] },
    security: { ...DEFAULT_SECURITY },
    prefs: { ...DEFAULT_PREFS, dismissedSuggestions: [] },
  };
}
