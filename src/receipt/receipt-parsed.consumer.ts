import { Injectable } from '@nestjs/common';
import { EventEnvelope } from '@modules/common/common.types';
import { ReceiptParsedPayload } from '../common/event-payloads.types';
import { ReceiptService } from './receipt.service';

@Injectable()
export class ReceiptParsedConsumer {
  constructor(private readonly receiptService: ReceiptService) {}

  async handleReceiptParsed(envelope: EventEnvelope<ReceiptParsedPayload>) {
    await this.receiptService.saveFromEvent(envelope.payload);
  }
}
