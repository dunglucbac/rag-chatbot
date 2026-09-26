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
import { LlmModule } from '../llm/llm.module';
import { ReceiptCategorizationService } from './categorization/receipt-categorization.service';
import { ReceiptCategorizationConsumer } from './receipt-categorization.consumer';

@Module({
  imports: [
    TypeOrmModule.forFeature([Receipt, ReceiptItem]),
    TelegramModule,
    MessageQueueModule,
    IngestionModule,
    LlmModule,
  ],
  providers: [
    ReceiptRepository,
    ReceiptService,
    ReceiptPaymentConsumer,
    ReceiptParsedConsumer,
    ReceiptReviewConsumer,
    ReceiptCategorizationService,
    ReceiptCategorizationConsumer,
  ],
  exports: [ReceiptService],
})
export class ReceiptModule {}
