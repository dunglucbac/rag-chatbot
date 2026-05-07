import { Injectable } from '@nestjs/common';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class ReceiptPaymentConsumer {
  constructor(private readonly telegramService: TelegramService) {}

  async handlePaymentDetected(event: any) {
    const { userId } = event;
    await this.telegramService.bot.telegram.sendMessage(
      userId,
      'I have a payment detected. Please provide receipt details (merchant, amount, date).',
    );
  }
}
