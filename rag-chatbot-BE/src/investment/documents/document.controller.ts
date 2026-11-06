import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { GoogleAuthGuard } from '../../auth/google-auth.guard';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { InvestmentDocumentService } from './document.service';

@Controller('investments/stocks/:symbol/documents')
@UseGuards(GoogleAuthGuard)
export class InvestmentDocumentController {
  constructor(private readonly documents: InvestmentDocumentService) {}
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('symbol') symbol: string,
  ) {
    return this.documents.list(user.id, symbol);
  }
  @Post()
  index(
    @CurrentUser() user: AuthenticatedUser,
    @Param('symbol') symbol: string,
    @Body() input: unknown,
  ) {
    return this.documents.index(user.id, symbol, input);
  }
  @Post('search')
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Param('symbol') symbol: string,
    @Body() input: unknown,
  ) {
    return this.documents.search(user.id, symbol, input);
  }
  @Get(':id/source')
  source(
    @CurrentUser() user: AuthenticatedUser,
    @Param('symbol') symbol: string,
    @Param('id') id: string,
  ) {
    return this.documents.source(user.id, symbol, id);
  }
}
