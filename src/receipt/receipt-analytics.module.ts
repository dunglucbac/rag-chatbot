import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DateRangeResolver } from './analytics/date-range-resolver';
import { ReceiptAnalyticsService } from './analytics/receipt-analytics.service';
import { PurchaseCursorCodec } from './analytics/purchase-cursor.codec';

@Module({
  providers: [
    DateRangeResolver,
    ReceiptAnalyticsService,
    {
      provide: PurchaseCursorCodec,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('receiptAnalytics.cursorHmacSecret');
        if (!secret) {
          throw new Error('RECEIPT_CURSOR_HMAC_SECRET is required');
        }
        return new PurchaseCursorCodec(secret);
      },
    },
  ],
  exports: [ReceiptAnalyticsService],
})
export class ReceiptAnalyticsModule {}
