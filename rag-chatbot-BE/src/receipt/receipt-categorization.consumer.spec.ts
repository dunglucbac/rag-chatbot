import { Test, TestingModule } from '@nestjs/testing';
import { MessageRouter } from '../message-queue/router/message-router.service';
import { ReceiptCategorizationService } from './categorization/receipt-categorization.service';
import { ReceiptCategorizationConsumer } from './receipt-categorization.consumer';

describe('ReceiptCategorizationConsumer', () => {
  let consumer: ReceiptCategorizationConsumer;
  let categorization: { categorizeReceipt: jest.Mock };
  let router: { register: jest.Mock };

  beforeEach(async () => {
    categorization = { categorizeReceipt: jest.fn() };
    router = { register: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptCategorizationConsumer,
        { provide: ReceiptCategorizationService, useValue: categorization },
        { provide: MessageRouter, useValue: router },
      ],
    }).compile();
    consumer = module.get(ReceiptCategorizationConsumer);
  });

  it('registers and dispatches receipt categorization events', async () => {
    consumer.onModuleInit();

    expect(router.register).toHaveBeenCalledWith(
      'receipt.items.categorize',
      expect.any(Function),
    );

    await consumer.handleReceiptCategorization({
      eventId: 'event-1',
      eventType: 'receipt.items.categorize',
      correlationId: 'job-1',
      schemaVersion: 1,
      attempt: 1,
      createdAt: '2026-09-23T00:00:00.000Z',
      payload: { receiptId: 'receipt-1', userId: 'user-1' },
    });

    expect(categorization.categorizeReceipt).toHaveBeenCalledWith(
      'receipt-1',
      'user-1',
    );
  });
});
