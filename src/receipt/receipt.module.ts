import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Receipt } from './entities/receipt.entity';
import { ReceiptItem } from './entities/receipt-item.entity';
import { ReceiptRepository } from './repositories/receipt.repository';
import { ReceiptService } from './receipt.service';
import { ReceiptPaymentConsumer } from './receipt-payment.consumer';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [TypeOrmModule.forFeature([Receipt, ReceiptItem]), TelegramModule],
  providers: [ReceiptRepository, ReceiptService, ReceiptPaymentConsumer],
  exports: [ReceiptService],
})
export class ReceiptModule {}
