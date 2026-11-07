import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { GoogleAuthGuard } from '../../auth/google-auth.guard';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { MarketDataProvider } from './market-data.provider';
import { ValuationService } from './valuation.service';

@Controller(['investments/market-data', 'investments/finhay'])
@UseGuards(GoogleAuthGuard)
export class MarketDataController {
  constructor(
    private readonly marketData: MarketDataProvider,
    private readonly valuations: ValuationService,
  ) {}

  @Get('status')
  status() {
    return { connected: this.marketData.isConfigured() };
  }

  @Get('quote/:symbol')
  quote(@Param('symbol') symbol: string) {
    return this.marketData.quote(symbol);
  }

  @Get('research-snapshot/:symbol')
  researchSnapshot(@Param('symbol') symbol: string) {
    return this.marketData.researchSnapshot(symbol);
  }

  @Get('valuation/:symbol')
  valuation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('symbol') symbol: string,
  ) {
    return this.valuations.get(user.id, symbol);
  }
}
