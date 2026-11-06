import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../auth/current-user.decorator';
import { GoogleAuthGuard } from '../../auth/google-auth.guard';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { FinhayService } from './finhay.service';
import { ValuationService } from './valuation.service';

@Controller('investments/finhay')
export class FinhayController {
  constructor(
    private readonly finhay: FinhayService,
    private readonly valuations: ValuationService,
  ) {}

  @Get('status')
  @UseGuards(GoogleAuthGuard)
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.finhay.status(user.id);
  }

  @Post('connect')
  @UseGuards(GoogleAuthGuard)
  connect(@CurrentUser() user: AuthenticatedUser) {
    return this.finhay.start(user.id);
  }

  @Delete('connection')
  @UseGuards(GoogleAuthGuard)
  disconnect(@CurrentUser() user: AuthenticatedUser) {
    return this.finhay.disconnect(user.id);
  }

  @Get('quote/:symbol')
  @UseGuards(GoogleAuthGuard)
  quote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('symbol') symbol: string,
  ) {
    return this.finhay.quote(user.id, symbol);
  }

  @Get('research-snapshot/:symbol')
  @UseGuards(GoogleAuthGuard)
  researchSnapshot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('symbol') symbol: string,
  ) {
    return this.finhay.researchSnapshot(user.id, symbol);
  }

  @Get('valuation/:symbol')
  @UseGuards(GoogleAuthGuard)
  valuation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('symbol') symbol: string,
  ) {
    return this.valuations.get(user.id, symbol);
  }

  @Get('callback')
  async callback(
    @Query('state') state: unknown,
    @Query('code') code: unknown,
    @Res() response: Response,
  ) {
    try {
      await this.finhay.callback(state, code);
      response.setHeader('Referrer-Policy', 'no-referrer');
      response.redirect('/#finhay=connected');
    } catch {
      response.setHeader('Referrer-Policy', 'no-referrer');
      response.redirect('/#finhay=failed');
    }
  }
}
