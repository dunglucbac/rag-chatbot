import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Receipt } from './entities/receipt.entity';
import { ReceiptItem } from './entities/receipt-item.entity';
import { ReceiptRepository } from './repositories/receipt.repository';
import { ReceiptService } from './receipt.service';
import { ReceiptPaymentConsumer } from './receipt-payment.consumer';
import { ReceiptReviewConsumer } from './receipt-review.consumer';
import { ReceiptParsedConsumer } from './receipt-parsed.consumer';
import { TelegramModule } from '../telegram/telegram.module';
import { MessageQueueModule } from '../message-queue/message-queue.module';
import { IngestionModule } from '../ingestion/ingestion.module';

@Module({
  imports: [TypeOrmModule.forFeature([Receipt, ReceiptItem]), TelegramModule, MessageQueueModule, IngestionModule],
  providers: [ReceiptRepository, ReceiptService, ReceiptPaymentConsumer, ReceiptParsedConsumer, ReceiptReviewConsumer],
  exports: [ReceiptService],
})
export class ReceiptModule {}
