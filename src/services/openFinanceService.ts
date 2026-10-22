import {
  OpenFinanceScope,
  PaymentMethod,
  Transaction,
  TxType,
} from '../types/finance';
import { todayISO } from '../utils/date';
import { norm, round2 } from '../utils/format';

export interface OpenFinanceInstitution {
  id: string;
  name: string;
  shortName: string;
  color: string;
  code: string;
  exportHint: string;
}

export const OPEN_FINANCE_INSTITUTIONS: OpenFinanceInstitution[] = [
  {
    id: 'nubank',
    name: 'Nubank (Nu Pagamentos)',
    shortName: 'Nubank',
    color: '#820AD1',
    code: '260',
    exportHint: 'No app Nubank: Conta ou Fatura → Exportar extrato (OFX ou CSV).',
  },
  {
    id: 'itau',
    name: 'Itaú Unibanco',
    shortName: 'Itaú',
    color: '#EC7000',
    code: '341',
    exportHint: 'No Itaú: Extrato → Compartilhar / Exportar em formato OFX.',
  },
  {
    id: 'inter',
    name: 'Banco Inter',
    shortName: 'Inter',
    color: '#FF7A00',
    code: '077',
    exportHint: 'No app Inter: Extrato → Ícone de exportar no topo → OFX ou CSV.',
  },
  {
    id: 'bradesco',
    name: 'Bradesco',
    shortName: 'Bradesco',
    color: '#CC092F',
    code: '237',
    exportHint: 'No Bradesco: Extrato → Salvar como arquivo OFX ou CSV.',
  },
  {
    id: 'btg',
    name: 'BTG Pactual',
    shortName: 'BTG',
    color: '#001E62',
    code: '208',
    exportHint: 'No BTG Banking: Extrato → Exportar extrato (OFX/CSV).',
  },
  {
    id: 'santander',
    name: 'Santander Brasil',
    shortName: 'Santander',
    color: '#EC0000',
    code: '033',
    exportHint: 'No Santander: Extrato → Exportar movimentações (OFX/CSV).',
  },
  {
    id: 'c6',
    name: 'C6 Bank',
    shortName: 'C6 Bank',
    color: '#1E1E1E',
    code: '336',
    exportHint: 'No app C6: Extrato → Exportar em OFX ou CSV.',
  },
  {
    id: 'bb',
    name: 'Banco do Brasil',
    shortName: 'Banco do Brasil',
    color: '#D4A017',
    code: '001',
    exportHint: 'No app BB: Extrato → Compartilhar / Exportar OFX.',
  },
  {
    id: 'caixa',
    name: 'Caixa Econômica Federal',
    shortName: 'Caixa',
    color: '#005CA9',
    code: '104',
    exportHint: 'No app Caixa: Extrato → Exportar em formato OFX.',
  },
  {
    id: 'xp',
    name: 'XP Investimentos / Conta XP',
    shortName: 'XP',
    color: '#111111',
    code: '102',
    exportHint: 'No app XP: Conta Digital / Cartão → Exportar extrato OFX/CSV.',
  },
];

export const OPEN_FINANCE_SCOPE_INFO: Record<
  OpenFinanceScope,
  { title: string; description: string; mandatory?: boolean }
> = {
  ACCOUNTS_READ: {
    title: 'Dados cadastrais da conta',
    description: 'Identificação da agência, número da conta e modalidade.',
    mandatory: true,
  },
  BALANCES_READ: {
    title: 'Saldos disponíveis',
    description: 'Leitura do saldo atual da conta corrente e poupança.',
  },
  TRANSACTIONS_READ: {
    title: 'Extrato de movimentações (Pix, TED e Débito)',
    description: 'Histórico de entradas e saídas da conta para conciliação.',
    mandatory: true,
  },
  CREDIT_CARDS_READ: {
    title: 'Faturas de cartão de crédito',
    description: 'Compras à vista e parceladas lançadas na fatura.',
  },
};

export interface ParsedBankTransaction {
  externalId: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  type: TxType;
  categoryId: string;
  paymentMethod: PaymentMethod;
  isDuplicate: boolean;
  selected: boolean;
}

export interface ParsedStatementResult {
  transactions: ParsedBankTransaction[];
  ledgerBalance?: number;
  bankCode?: string;
  sourceFormat: 'OFX' | 'CSV' | 'API';
}

/**
 * Classifica automaticamente a categoria e o meio de pagamento com base na descrição do extrato bancário brasileiro
 */
export function autoCategorizeTransaction(
  rawDescription: string,
  type: TxType
): { categoryId: string; paymentMethod: PaymentMethod; cleanDescription: string } {
  const cleanDescription = rawDescription
    .replace(/\s+/g, ' ')
    .replace(/^(COMPRA CARTAO|COMPRA NO DEBITO|PIX ENVIADO|PIX RECEBIDO|TRANSF PIX|PAGAMENTO BOLETO)\s*[-:]?\s*/i, '')
    .trim();

  const d = norm(rawDescription);

  // Detecta meio de pagamento
  let paymentMethod: PaymentMethod = 'pix';
  if (d.includes('credito') || d.includes('fatura') || d.includes('parc ')) {
    paymentMethod = 'credit';
  } else if (d.includes('debito') || d.includes('compra cartao') || d.includes('elo') || d.includes('master') || d.includes('visa')) {
    paymentMethod = 'debit';
  } else if (d.includes('boleto') || d.includes('titulo') || d.includes('convenio')) {
    paymentMethod = 'boleto';
  } else if (d.includes('ted') || d.includes('doc') || d.includes('transf')) {
    paymentMethod = 'transfer';
  }

  if (type === 'income') {
    if (d.includes('salario') || d.includes('remuneracao') || d.includes('folha') || d.includes('proventos') || d.includes('adiantamento')) {
      return { categoryId: 'salario', paymentMethod, cleanDescription: cleanDescription || rawDescription };
    }
    if (d.includes('rendimento') || d.includes('dividendo') || d.includes('jcp') || d.includes('cdb') || d.includes('tesouro') || d.includes('remunerada')) {
      return { categoryId: 'rendimentos', paymentMethod, cleanDescription: cleanDescription || rawDescription };
    }
    if (d.includes('estorno') || d.includes('reembolso') || d.includes('cashback') || d.includes('devolucao')) {
      return { categoryId: 'reembolso', paymentMethod, cleanDescription: cleanDescription || rawDescription };
    }
    return { categoryId: 'outras_receitas', paymentMethod, cleanDescription: cleanDescription || rawDescription };
  }

  // Categorias de Despesa
  if (
    d.includes('uber') ||
    d.includes('99app') ||
    d.includes('99 pop') ||
    d.includes('posto') ||
    d.includes('ipiranga') ||
    d.includes('shell') ||
    d.includes('petrobras') ||
    d.includes('sem parar') ||
    d.includes('veloe') ||
    d.includes('estacionamento') ||
    d.includes('pedagio') ||
    d.includes('metro') ||
    d.includes('bilhete')
  ) {
    return { categoryId: 'transporte', paymentMethod, cleanDescription: cleanDescription || rawDescription };
  }

  if (
    d.includes('ifood') ||
    d.includes('ifd*') ||
    d.includes('rappi') ||
    d.includes('zé delivery') ||
    d.includes('ze delivery') ||
    d.includes('restaurante') ||
    d.includes('padaria') ||
    d.includes('lanchonete') ||
    d.includes('burger') ||
    d.includes('mcdonalds') ||
    d.includes('outback') ||
    d.includes('starbucks') ||
    d.includes('cafe') ||
    d.includes('pizzaria') ||
    d.includes('sushi')
  ) {
    return { categoryId: 'alimentacao', paymentMethod, cleanDescription: cleanDescription || rawDescription };
  }

  if (
    d.includes('mercado') ||
    d.includes('supermercado') ||
    d.includes('carrefour') ||
    d.includes('pao de acucar') ||
    d.includes('assai') ||
    d.includes('atacadao') ||
    d.includes('extra') ||
    d.includes('dia %') ||
    d.includes('oba ') ||
    d.includes('hortifruti') ||
    d.includes('minuto pao')
  ) {
    return { categoryId: 'mercado', paymentMethod, cleanDescription: cleanDescription || rawDescription };
  }

  if (
    d.includes('netflix') ||
    d.includes('spotify') ||
    d.includes('apple.com/bill') ||
    d.includes('icloud') ||
    d.includes('amazon prime') ||
    d.includes('disney') ||
    d.includes('max.com') ||
    d.includes('hbo') ||
    d.includes('youtube') ||
    d.includes('openai') ||
    d.includes('chatgpt') ||
    d.includes('google one') ||
    d.includes('assinatura')
  ) {
    return { categoryId: 'assinaturas', paymentMethod, cleanDescription: cleanDescription || rawDescription };
  }

  if (
    d.includes('drogasil') ||
    d.includes('droga raia') ||
    d.includes('drogaria') ||
    d.includes('farmacia') ||
    d.includes('pague menos') ||
    d.includes('panvel') ||
    d.includes('unimed') ||
    d.includes('amil') ||
    d.includes('bradesco saude') ||
    d.includes('sulamerica') ||
    d.includes('hospital') ||
    d.includes('clinica') ||
    d.includes('laboratorio') ||
    d.includes('fleury') ||
    d.includes('dasa')
  ) {
    return { categoryId: 'saude', paymentMethod, cleanDescription: cleanDescription || rawDescription };
  }

  if (
    d.includes('aluguel') ||
    d.includes('condominio') ||
    d.includes('quintoandar') ||
    d.includes('quinto andar') ||
    d.includes('iptu')
  ) {
    return { categoryId: 'moradia', paymentMethod, cleanDescription: cleanDescription || rawDescription };
  }

  if (
    d.includes('enel') ||
    d.includes('cpfl') ||
    d.includes('light') ||
    d.includes('cemig') ||
    d.includes('copel') ||
    d.includes('neoenergia') ||
    d.includes('sabesp') ||
    d.includes('saneago') ||
    d.includes('comgas') ||
    d.includes('vivo') ||
    d.includes('claro') ||
    d.includes('tim ') ||
    d.includes('internet') ||
    d.includes('energia')
  ) {
    return { categoryId: 'contas', paymentMethod, cleanDescription: cleanDescription || rawDescription };
  }

  if (
    d.includes('emprestimo') ||
    d.includes('financiamento') ||
    d.includes('parcela ') ||
    d.includes('consignado') ||
    d.includes('juros') ||
    d.includes('iof')
  ) {
    return { categoryId: 'dividas', paymentMethod, cleanDescription: cleanDescription || rawDescription };
  }

  if (
    d.includes('mercadolivre') ||
    d.includes('mercado livre') ||
    d.includes('amazon') ||
    d.includes('shopee') ||
    d.includes('magalu') ||
    d.includes('shein') ||
    d.includes('zara') ||
    d.includes('renner')
  ) {
    return { categoryId: 'compras', paymentMethod, cleanDescription: cleanDescription || rawDescription };
  }

  if (
    d.includes('faculdade') ||
    d.includes('escola') ||
    d.includes('curso') ||
    d.includes('alura') ||
    d.includes('udemy')
  ) {
    return { categoryId: 'educacao', paymentMethod, cleanDescription: cleanDescription || rawDescription };
  }

  if (
    d.includes('cinema') ||
    d.includes('ingresso') ||
    d.includes('sympla') ||
    d.includes('eventim') ||
    d.includes('teatro') ||
    d.includes('show')
  ) {
    return { categoryId: 'lazer', paymentMethod, cleanDescription: cleanDescription || rawDescription };
  }

  return { categoryId: 'outros', paymentMethod, cleanDescription: cleanDescription || rawDescription };
}

function buildDeterministicExternalId(date: string, amount: number, desc: string, fitId?: string): string {
  if (fitId && fitId.trim().length > 2) {
    return `fitid:${fitId.trim()}`;
  }
  return `hash:${date}:${amount.toFixed(2)}:${norm(desc).slice(0, 40)}`;
}

function isAlreadyImported(
  externalId: string,
  date: string,
  amount: number,
  description: string,
  existingTxs: Transaction[]
): boolean {
  const normDesc = norm(description);
  return existingTxs.some((t) => {
    if (t.externalId && t.externalId === externalId) return true;
    return (
      t.date === date &&
      Math.abs(t.amount - amount) < 0.01 &&
      norm(t.description) === normDesc
    );
  });
}

/**
 * Parser completo para arquivos .OFX (Open Financial Exchange) emitidos por bancos brasileiros
 */
export function parseOfxStatement(
  rawText: string,
  existingTxs: Transaction[]
): ParsedStatementResult {
  const results: ParsedBankTransaction[] = [];

  // Extrai código do banco (<BANKID>) e saldo final (<LEDGERBAL><BALAMT>) se disponível
  const bankIdMatch = rawText.match(/<BANKID>([^<\r\n]+)/i);
  const balMatch = rawText.match(/<BALAMT>([+-]?\d+(?:[.,]\d+)?)/i);
  const ledgerBalance = balMatch
    ? Number(balMatch[1].replace(',', '.'))
    : undefined;

  // Extrai cada bloco <STMTTRN> ... </STMTTRN> (ou blocos SGML abertos)
  const parts = rawText.split(/<STMTTRN>/i).slice(1);

  for (const rawBlock of parts) {
    const block = rawBlock.split(/<\/STMTTRN>/i)[0] || rawBlock;

    const extractTag = (tag: string): string => {
      const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i'));
      return m ? m[1].trim() : '';
    };

    const trnType = extractTag('TRNTYPE').toUpperCase();
    const dtPosted = extractTag('DTPOSTED');
    const trnAmtRaw = extractTag('TRNAMT').replace(',', '.');
    const fitId = extractTag('FITID');
    const memo = extractTag('MEMO');
    const name = extractTag('NAME');

    const signedAmt = Number(trnAmtRaw);
    if (!Number.isFinite(signedAmt) || Math.abs(signedAmt) < 0.01) continue;

    // Formata data YYYYMMDD... -> YYYY-MM-DD
    let isoDate = todayISO();
    const dateDigits = dtPosted.replace(/\D/g, '');
    if (dateDigits.length >= 8) {
      isoDate = `${dateDigits.slice(0, 4)}-${dateDigits.slice(4, 6)}-${dateDigits.slice(6, 8)}`;
    }

    const rawDesc = [memo, name]
      .filter(Boolean)
      .join(' - ')
      .replace(/\s+/g, ' ')
      .trim() || 'Movimentação Bancária';

    const type: TxType =
      signedAmt > 0 && trnType !== 'DEBIT' ? 'income' : 'expense';
    const absAmount = round2(Math.abs(signedAmt));

    const { categoryId, paymentMethod, cleanDescription } =
      autoCategorizeTransaction(rawDesc, type);

    const externalId = buildDeterministicExternalId(
      isoDate,
      absAmount,
      cleanDescription,
      fitId
    );
    const duplicate = isAlreadyImported(
      externalId,
      isoDate,
      absAmount,
      cleanDescription,
      existingTxs
    );

    results.push({
      externalId,
      date: isoDate,
      description: cleanDescription,
      amount: absAmount,
      type,
      categoryId,
      paymentMethod,
      isDuplicate: duplicate,
      selected: !duplicate,
    });
  }

  return {
    transactions: results.sort((a, b) => b.date.localeCompare(a.date)),
    ledgerBalance: Number.isFinite(ledgerBalance) ? ledgerBalance : undefined,
    bankCode: bankIdMatch ? bankIdMatch[1].trim() : undefined,
    sourceFormat: 'OFX',
  };
}

/**
 * Parser inteligente para arquivos .CSV de extratos e faturas (Nubank, Inter, Itaú, C6, BTG, etc.)
 */
export function parseCsvStatement(
  rawText: string,
  existingTxs: Transaction[],
  isCreditCardInvoice = false
): ParsedStatementResult {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return { transactions: [], sourceFormat: 'CSV' };
  }

  // Detecta delimitador (; ou ,)
  const firstLine = lines[0];
  const delimiter =
    (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length
      ? ';'
      : ',';

  const splitRow = (row: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === delimiter && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  // Encontra a linha de cabeçalho (alguns bancos como Inter/Itaú têm linhas de cabeçalho institucional antes da tabela)
  let headerIndex = 0;
  for (let i = 0; i < Math.min(12, lines.length); i++) {
    const cols = splitRow(lines[i]).map((c) => norm(c));
    if (
      cols.some((c) => c.includes('data') || c === 'date') &&
      cols.some((c) => c.includes('valor') || c === 'amount' || c.includes('quantia'))
    ) {
      headerIndex = i;
      break;
    }
  }

  const headers = splitRow(lines[headerIndex]).map((h) => norm(h));
  const dateIdx = headers.findIndex((h) => h.includes('data') || h === 'date');
  const valIdx = headers.findIndex(
    (h) => h.includes('valor') || h === 'amount' || h.includes('quantia')
  );
  const descIdx = headers.findIndex(
    (h) =>
      h.includes('descri') ||
      h.includes('titulo') ||
      h.includes('title') ||
      h.includes('historico') ||
      h.includes('estabelecimento') ||
      h.includes('lancamento')
  );
  const idIdx = headers.findIndex(
    (h) => h.includes('identificador') || h === 'id' || h.includes('codigo')
  );

  const results: ParsedBankTransaction[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cols = splitRow(lines[i]);
    if (cols.length < 2) continue;

    const rawDate = cols[dateIdx >= 0 ? dateIdx : 0] || '';
    const rawVal = cols[valIdx >= 0 ? valIdx : cols.length - 1] || '';
    const rawDesc =
      cols[descIdx >= 0 ? descIdx : 1] || 'Movimentação Importada';
    const rawId = idIdx >= 0 ? cols[idIdx] : undefined;

    // Normaliza data (DD/MM/YYYY ou YYYY-MM-DD)
    let isoDate = '';
    if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
      isoDate = rawDate.slice(0, 10);
    } else if (/^\d{2}\/\d{2}\/\d{4}/.test(rawDate)) {
      const [dd, mm, yyyy] = rawDate.slice(0, 10).split('/');
      isoDate = `${yyyy}-${mm}-${dd}`;
    } else {
      continue;
    }

    // Normaliza valor monetário (ex: "-1.234,56" ou "-45.90" ou "R$ 120,00")
    let cleanedVal = rawVal.replace(/[R$\s]/g, '');
    if (cleanedVal.includes(',') && cleanedVal.includes('.')) {
      cleanedVal = cleanedVal.replace(/\./g, '').replace(',', '.');
    } else if (cleanedVal.includes(',')) {
      cleanedVal = cleanedVal.replace(',', '.');
    }

    const signedAmt = Number(cleanedVal);
    if (!Number.isFinite(signedAmt) || Math.abs(signedAmt) < 0.01) continue;

    // Em CSV de fatura de cartão do Nubank, compras vêm como positivas e pagamentos de fatura como negativos
    let type: TxType = signedAmt >= 0 ? 'income' : 'expense';
    if (isCreditCardInvoice) {
      type = signedAmt > 0 ? 'expense' : 'income';
    }

    const absAmount = round2(Math.abs(signedAmt));
    const { categoryId, paymentMethod, cleanDescription } =
      autoCategorizeTransaction(rawDesc, type);

    const externalId = buildDeterministicExternalId(
      isoDate,
      absAmount,
      cleanDescription,
      rawId
    );
    const duplicate = isAlreadyImported(
      externalId,
      isoDate,
      absAmount,
      cleanDescription,
      existingTxs
    );

    results.push({
      externalId,
      date: isoDate,
      description: cleanDescription,
      amount: absAmount,
      type,
      categoryId,
      paymentMethod: isCreditCardInvoice ? 'credit' : paymentMethod,
      isDuplicate: duplicate,
      selected: !duplicate,
    });
  }

  return {
    transactions: results.sort((a, b) => b.date.localeCompare(a.date)),
    sourceFormat: 'CSV',
  };
}
