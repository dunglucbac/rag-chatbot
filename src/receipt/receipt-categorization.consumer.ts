import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEnvelope } from '../common/common.types';
import { ReceiptCategorizationRequestedPayload } from '../common/event-payloads.types';
import { MessageRouter } from '../message-queue/router/message-router.service';
import { EventHandler } from '../message-queue/message-queue.types';
import { ReceiptCategorizationService } from './categorization/receipt-categorization.service';

@Injectable()
export class ReceiptCategorizationConsumer implements OnModuleInit {
  constructor(
    private readonly categorizationService: ReceiptCategorizationService,
    private readonly router: MessageRouter,
  ) {}

  onModuleInit(): void {
    this.router.register(
      'receipt.items.categorize',
      this.handleReceiptCategorization.bind(this) as EventHandler,
    );
  }

  async handleReceiptCategorization(
    envelope: EventEnvelope<ReceiptCategorizationRequestedPayload>,
  ): Promise<void> {
    if (!envelope.payload) {
      return;
    }
    await this.categorizationService.categorizeReceipt(
      envelope.payload.receiptId,
      envelope.payload.userId,
    );
  }
}
