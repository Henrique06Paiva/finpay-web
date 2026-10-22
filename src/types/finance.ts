export type TxType = 'income' | 'expense' | 'transfer' | 'investment';
export type TxStatus = 'paid' | 'pending';
export type PaymentMethod = 'pix' | 'debit' | 'credit' | 'cash' | 'transfer' | 'boleto';
export type AccountType = 'checking' | 'savings' | 'wallet' | 'credit' | 'investment';
export type Frequency = 'weekly' | 'monthly' | 'yearly';
export type CategoryKind = 'income' | 'expense';
export type AppTab = 'home' | 'tx' | 'plan' | 'debts' | 'goals' | 'settings';

export interface PayrollDeduction {
  id: string;
  code?: string;
  name: string;
  amount: number;
}

export interface PayrollAdjustment {
  id: string;
  name: string;
  amount: number;
  type: 'earning' | 'deduction';
}

export interface PayrollConfig {
  enabled: boolean;
  employerName: string;
  role: string;
  grossSalary: number;
  deductions: PayrollDeduction[];
  monthlyAdjustments?: Record<string, PayrollAdjustment[]>;
  payDayRule: 'last_business_day' | 'last_day' | 'fifth_business_day';
  accountId: string;
}

export type DebtKind =
  | 'loan'
  | 'financing'
  | 'credit_card'
  | 'overdraft'
  | 'consigned'
  | 'other';

export type AmortizationSystem = 'price' | 'sac' | 'fixed';

export interface Debt {
  id: string;
  name: string;
  creditor?: string;
  kind: DebtKind;
  amortizationSystem: AmortizationSystem;
  /** Valor original contratado */
  originalAmount: number;
  /** Saldo devedor principal restante hoje */
  currentBalance: number;
  /** Taxa de juros mensal em % (ex: 1.99 para 1,99% a.m.) */
  monthlyInterestRate: number;
  /** Quantidade total de parcelas contratadas */
  totalInstallments: number;
  /** Quantidade de parcelas já pagas */
  paidInstallments: number;
  /** Valor atual da parcela mensal */
  monthlyPayment: number;
  /** Dia do vencimento (1-31) */
  dueDay: number;
  accountId: string;
  notes?: string;
  createdAt: number;
}

export interface UserProfile {
  name: string;
  email?: string;
  monthlyIncomeGoal?: number;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** Saldo antes de qualquer lançamento registrado no app */
  initialBalance: number;
  color: string;
  archived?: boolean;
}

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  custom?: boolean;
}

export interface Transaction {
  id: string;
  type: TxType;
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
  categoryId?: string;
  accountId: string;
  /** Somente para transferências: conta de destino */
  toAccountId?: string;
  paymentMethod?: PaymentMethod;
  status: TxStatus;
  tags: string[];
  notes?: string;
  /** Pagamento de conta fixa */
  billId?: string;
  /** Vencimento a que o pagamento se refere (permite desfazer) */
  dueRef?: string;
  /** Aporte em meta */
  goalId?: string;
  /** ID único da transação no banco (FITID do OFX ou hash Open Finance) para evitar duplicidade */
  externalId?: string;
  /** ID do consentimento Open Finance de origem */
  openFinanceConsentId?: string;
  /** Referência ao mês do holerite CLT (ex: 2026-09) */
  payrollYm?: string;
  installment?: { index: number; total: number; groupId: string };
  createdAt: number;
}

export interface Budget {
  categoryId: string;
  limit: number;
}

export interface Bill {
  id: string;
  name: string;
  amount: number;
  categoryId: string;
  accountId: string;
  paymentMethod: PaymentMethod;
  frequency: Frequency;
  nextDue: string; // YYYY-MM-DD
  anchorDay: number; // dia de vencimento original (evita "deriva" em meses curtos)
  remindDaysBefore: number;
  active: boolean;
  createdAt: number;
}

export type BenchmarkType = '100_CDI' | '110_CDI' | 'TESOURO_SELIC' | 'IPCA_PLUS_6' | 'POUPANCA';

export interface StrategicGoal {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number;
  targetDate: string; // YYYY-MM
  benchmark: BenchmarkType;
  priority: 'Alta' | 'Média' | 'Essencial';
  recommendedAsset: string;
  notes?: string;
  createdAt?: number;
}

export interface MarketIndicators {
  selic: number;
  cdi: number;
  ipca: number;
  usdBid: number;
  usdChange: number;
  eurBid: number;
  eurChange: number;
  btcBid: number;
  btcChange: number;
  ibovPoints: number;
  ibovChange: number;
  updatedAt: string;
  isLive: boolean;
}

export interface SecuritySettings {
  pinHash: string | null;
  biometricsEnabled: boolean;
  webAuthnCredentialId: string | null;
  hideBalancesByDefault: boolean;
  monthlyOverallBudget: number;
}

export type OpenFinanceScope =
  | 'ACCOUNTS_READ'
  | 'BALANCES_READ'
  | 'TRANSACTIONS_READ'
  | 'CREDIT_CARDS_READ';

export interface OpenFinanceConsent {
  id: string;
  institutionId: string;
  institutionName: string;
  institutionColor: string;
  accountId: string;
  scopes: OpenFinanceScope[];
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  validityMonths: 3 | 6 | 12;
  createdAt: string; // YYYY-MM-DD
  expiresAt: string; // YYYY-MM-DD
  lastSyncAt?: string;
  pluggyItemId?: string;
  importedCount: number;
}

export interface Preferences {
  remindersEnabled: boolean;
  dismissedSuggestions: string[];
  profile?: UserProfile;
  openFinanceConsents?: OpenFinanceConsent[];
}

export interface FinanceState {
  version: 3;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  bills: Bill[];
  debts: Debt[];
  goals: StrategicGoal[];
  payroll?: PayrollConfig;
  security: SecuritySettings;
  prefs: Preferences;
}
