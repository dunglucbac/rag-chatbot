export interface MarketQuote {
  source: string;
  symbol: string;
  priceVnd: number | null;
  currency: 'VND';
  updatedAt: string | null;
  change: number | null;
  changePercent: number | null;
}

export interface ResearchSnapshot {
  source: string;
  symbol: string;
  retrievedAt: string;
  evidence: Record<string, unknown>;
  unavailable: string[];
}

// Bind a different provider in InvestmentModule to change the market-data source.
export abstract class MarketDataProvider {
  abstract isConfigured(): boolean;
  abstract quote(symbol: string): Promise<MarketQuote>;
  abstract researchSnapshot(symbol: string): Promise<ResearchSnapshot>;
}
