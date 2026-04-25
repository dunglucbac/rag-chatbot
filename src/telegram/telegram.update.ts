import { Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Update } from 'telegraf/types';
import { TelegramService } from './telegram.service';
import { AgentService } from '../agent/agent.service';

@Controller('telegram')
export class TelegramUpdate {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly agentService: AgentService,
  ) {
    this.telegramService.bot.on('text', async (ctx) => {
      const userId = String(ctx.from.id);
      const message = ctx.message.text;

      try {
        const reply = await this.agentService.invoke(userId, message);
        await ctx.reply(reply);
      } catch (err) {
        console.error('Agent error:', err);
        await ctx.reply('Sorry, something went wrong. Please try again.');
      }
    });
  }

  @Post('webhook')
  async handleWebhook(@Req() { body }: Request, @Res() res: Response) {
    await this.telegramService.bot.handleUpdate(body as Update, res);
  }
}
