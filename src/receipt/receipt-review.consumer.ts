import { Injectable } from '@nestjs/common';
import { EventEnvelope } from '@modules/common/common.types';
import { NeedsReviewPayload } from '../common/event-payloads.types';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class ReceiptReviewConsumer {
  constructor(private readonly telegramService: TelegramService) {}

  async handleNeedsReview(envelope: EventEnvelope<NeedsReviewPayload>) {
    if (!envelope.payload) return;
    const { userId, receipt, lineItems, jobId } = envelope.payload;

    const lines = [
      `I parsed this receipt but I'm not 100% sure. Can you confirm?`,
      ``,
      `Merchant: ${receipt.merchant}`,
      `Total: $${receipt.total.toFixed(2)}`,
      lineItems?.length ? `Items:` : '',
      ...(lineItems || []).map(
        (item) => `  - ${item.name}: $${item.totalPrice.toFixed(2)}`,
      ),
    ].filter(Boolean);

    await this.telegramService.bot.telegram.sendMessage(userId, lines.join('\n'), {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Looks good', callback_data: `review:approve:${jobId}` },
            { text: 'Edit', callback_data: `review:edit:${jobId}` },
            { text: 'Reject', callback_data: `review:reject:${jobId}` },
          ],
        ],
      },
    });
  }
}
