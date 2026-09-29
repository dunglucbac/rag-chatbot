import { Test, TestingModule } from '@nestjs/testing';
import { ReceiptPaymentConsumer } from './receipt-payment.consumer';
import { MessageRouter } from '../message-queue/router/message-router.service';
import { IngestionJobRepository } from '../repositories/ingestion-job.repository';
import type { PaymentDetectedPayload } from '@modules/common/event-payloads.types';
import type { EventEnvelope } from '@modules/common/common.types';
import { EventType } from '@modules/common/event-types';

describe('ReceiptPaymentConsumer', () => {
  let consumer: ReceiptPaymentConsumer;
  let jobRepo: IngestionJobRepository;

  beforeEach(async () => {
    const mockRouter = { register: jest.fn() };
    const mockJobRepo = { findById: jest.fn(), save: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptPaymentConsumer,
        { provide: MessageRouter, useValue: mockRouter },
        { provide: IngestionJobRepository, useValue: mockJobRepo },
      ],
    }).compile();

    consumer = module.get<ReceiptPaymentConsumer>(ReceiptPaymentConsumer);
    jobRepo = module.get<IngestionJobRepository>(IngestionJobRepository);
  });

  it('registers for payment.detected events on init', () => {
    (consumer as unknown as { onModuleInit: () => void }).onModuleInit();
    const router = (consumer as unknown as { router: MessageRouter }).router;
    expect(router.register).toHaveBeenCalledWith(
      EventType.PAYMENT_DETECTED,
      expect.any(Function),
    );
  });

  it('marks payment jobs as needs_review', async () => {
    (jobRepo.findById as jest.Mock).mockResolvedValue({
      id: 'job-123',
      status: 'pending',
    });
    const payload: PaymentDetectedPayload = {
      jobId: 'job-123',
      userId: '12345',
      extractedText: 'Bank Transfer\nAmount: $50.00\nTo: ABC Store',
    };
    const envelope: EventEnvelope<PaymentDetectedPayload> = {
      eventId: 'evt-1',
      eventType: EventType.PAYMENT_DETECTED,
      correlationId: 'corr-123',
      schemaVersion: 1,
      attempt: 1,
      createdAt: new Date().toISOString(),
      payload,
    };
    await consumer.handlePaymentDetected(envelope);

    expect(jobRepo.findById).toHaveBeenCalledWith('job-123');
    expect(jobRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'needs_review',
        classification: 'payment',
      }),
    );
  });
});
