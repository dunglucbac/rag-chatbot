import { Injectable, Logger } from '@nestjs/common';
import { EventEnvelope } from '@modules/common/common.types';
import { ReceiptParsedPayload } from '../common/event-payloads.types';
import { ReceiptService } from './receipt.service';

@Injectable()
export class ReceiptParsedConsumer {
  private readonly logger = new Logger(ReceiptParsedConsumer.name);

  constructor(private readonly receiptService: ReceiptService) {}

  async handleReceiptParsed(envelope: EventEnvelope<ReceiptParsedPayload>) {
    if (!envelope.payload) return;
    this.logger.log(`handleReceiptParsed [correlationId=${envelope.correlationId} jobId=${envelope.payload.jobId}]`);
    await this.receiptService.saveFromEvent(envelope.payload);
  }
}
