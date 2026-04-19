import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';

@Injectable()
export class TelegramService implements OnModuleInit {
  readonly bot: Telegraf;

  constructor(private readonly config: ConfigService) {
    this.bot = new Telegraf(this.config.get<string>('telegram.botToken')!);
  }

  async onModuleInit() {
    const webhookUrl = this.config.get<string>('telegram.webhookUrl');
    await this.bot.telegram.setWebhook(`${webhookUrl}/telegram/webhook`);
  }
}
