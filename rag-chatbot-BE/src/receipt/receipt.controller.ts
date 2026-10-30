import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReceiptBrowserService } from './receipt-browser.service';
import { GoogleAuthGuard } from '../auth/google-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { pageNumber } from '../common/pagination';

@Controller('receipts')
@UseGuards(GoogleAuthGuard)
export class ReceiptController {
  constructor(private readonly receipts: ReceiptBrowserService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('offset') offset?: string,
    @Query('ingestionJobId') ingestionJobId?: string,
  ) {
    return this.receipts.list(
      user.id,
      { q, from, to, ingestionJobId },
      pageNumber(offset),
    );
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.receipts.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: unknown,
  ) {
    return this.receipts.update(user.id, id, input);
  }
}
