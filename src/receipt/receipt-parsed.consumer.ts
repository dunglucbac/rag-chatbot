import { Injectable } from '@nestjs/common';
import { ReceiptService } from './receipt.service';

@Injectable()
export class ReceiptParsedConsumer {
  constructor(private readonly receiptService: ReceiptService) {}

  async handleReceiptParsed(event: any) {
    await this.receiptService.saveFromEvent(event);
  }
}
