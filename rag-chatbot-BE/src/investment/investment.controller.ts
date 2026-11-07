import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { GoogleAuthGuard } from '../auth/google-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { InvestmentService } from './investment.service';

@Controller('investments/stocks')
@UseGuards(GoogleAuthGuard)
export class InvestmentController {
  constructor(private readonly investments: InvestmentService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.investments.list(user.id);
  }

  @Get(':symbol')
  get(@CurrentUser() user: AuthenticatedUser, @Param('symbol') symbol: string) {
    return this.investments.get(user.id, symbol);
  }

  @Post(':symbol/events')
  record(
    @CurrentUser() user: AuthenticatedUser,
    @Param('symbol') symbol: string,
    @Body() input: unknown,
  ) {
    return this.investments.record(user.id, symbol, input);
  }
}
