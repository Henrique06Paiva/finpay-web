import { MarketIndicators } from "../types/finance";

const CACHE_KEY = "aura_market_cache_v1";

export const DEFAULT_MARKET: MarketIndicators = {
  selic: 10.75,
  cdi: 10.65,
  ipca: 4.42,
  usdBid: 5.68,
  usdChange: -0.24,
  eurBid: 6.18,
  eurChange: 0.12,
  btcBid: 394500,
  btcChange: 2.35,
  ibovPoints: 131450,
  ibovChange: 0.68,
  updatedAt: new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }),
  isLive: false,
};

export function getCachedMarketData(): MarketIndicators {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return DEFAULT_MARKET;
    return { ...DEFAULT_MARKET, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_MARKET;
  }
}

export async function fetchLiveMarketIndicators(): Promise<MarketIndicators> {
  const current = getCachedMarketData();
  const next: MarketIndicators = { ...current };
  let anySuccess = false;

  // 1. Fetch Taxas BrasilAPI (Selic, CDI, IPCA)
  try {
    const resTaxas = await fetch("https://brasilapi.com.br/api/taxas/v1", {
      signal: AbortSignal.timeout(6000),
    });
    if (resTaxas.ok) {
      const taxas: Array<{ nome: string; valor: number }> =
        await resTaxas.json();
      const selicObj = taxas.find((t) =>
        t.nome.toUpperCase().includes("SELIC"),
      );
      const cdiObj = taxas.find((t) => t.nome.toUpperCase().includes("CDI"));
      const ipcaObj = taxas.find((t) => t.nome.toUpperCase().includes("IPCA"));

      if (selicObj && Number.isFinite(Number(selicObj.valor))) {
        next.selic = Number(selicObj.valor);
        anySuccess = true;
      }
      if (cdiObj && Number.isFinite(Number(cdiObj.valor))) {
        next.cdi = Number(cdiObj.valor);
        anySuccess = true;
      } else if (selicObj) {
        next.cdi = Number((next.selic - 0.1).toFixed(2));
      }
      if (ipcaObj && Number.isFinite(Number(ipcaObj.valor))) {
        next.ipca = Number(ipcaObj.valor);
      }
    }
  } catch {
    // Fallback silencioso para cache local
  }

  // 2. Fetch Câmbio e Cripto via AwesomeAPI (USD-BRL, EUR-BRL, BTC-BRL)
  try {
    const resFx = await fetch(
      "https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,BTC-BRL",
      {
        signal: AbortSignal.timeout(6000),
      },
    );
    if (resFx.ok) {
      const fx = await resFx.json();
      if (fx.USDBRL) {
        next.usdBid = Number(fx.USDBRL.bid);
        next.usdChange = Number(fx.USDBRL.pctChange);
        anySuccess = true;
      }
      if (fx.EURBRL) {
        next.eurBid = Number(fx.EURBRL.bid);
        next.eurChange = Number(fx.EURBRL.pctChange);
        anySuccess = true;
      }
      if (fx.BTCBRL) {
        next.btcBid = Number(fx.BTCBRL.bid);
        next.btcChange = Number(fx.BTCBRL.pctChange);
        anySuccess = true;
      }
    }
  } catch {
    // Fallback silencioso
  }

  next.updatedAt = new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  next.isLive = anySuccess;

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }

  return next;
}

export function getAnnualBenchmarkRate(
  benchmark: string,
  market: MarketIndicators,
): { grossAnnual: number; netAnnual: number; label: string } {
  const cdi = market.cdi || 10.65;
  const selic = market.selic || 10.75;
  const ipca = market.ipca || 4.42;

  switch (benchmark) {
    case "110_CDI": {
      const gross = cdi * 1.1;
      return {
        grossAnnual: gross,
        netAnnual: gross * 0.825, // IR médio 17,5%
        label: "110% do CDI (Líquido IR)",
      };
    }
    case "TESOURO_SELIC": {
      return {
        grossAnnual: selic,
        netAnnual: selic * 0.825,
        label: "Tesouro Selic (Líquido IR)",
      };
    }
    case "IPCA_PLUS_6": {
      const gross = ((1 + ipca / 100) * 1.06 - 1) * 100;
      return {
        grossAnnual: gross,
        netAnnual: gross * 0.85, // IR longo prazo 15%
        label: "Tesouro IPCA+ 6% a.a.",
      };
    }
    case "POUPANCA": {
      const poup = selic > 8.5 ? 6.17 + 0.8 : selic * 0.7;
      return {
        grossAnnual: poup,
        netAnnual: poup, // Isenta
        label: "Poupança (Isenta)",
      };
    }
    case "100_CDI":
    default: {
      return {
        grossAnnual: cdi,
        netAnnual: cdi * 0.825,
        label: "100% do CDI (Líquido IR)",
      };
    }
  }
}

export function annualToMonthlyRate(annualPct: number): number {
  return Math.pow(1 + annualPct / 100, 1 / 12) - 1;
}
