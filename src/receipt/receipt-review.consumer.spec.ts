import { Test, TestingModule } from '@nestjs/testing';
import { ReceiptReviewConsumer } from './receipt-review.consumer';
import { MessageRouter } from '../message-queue/router/message-router.service';
import { IngestionJobRepository } from '../repositories/ingestion-job.repository';
import { NeedsReviewPayload } from '@modules/common/event-payloads.types';
import { EventEnvelope } from '@modules/common/common.types';

describe('ReceiptReviewConsumer', () => {
  let consumer: ReceiptReviewConsumer;
  let jobRepo: IngestionJobRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptReviewConsumer,
        { provide: MessageRouter, useValue: { register: jest.fn() } },
        {
          provide: IngestionJobRepository,
          useValue: { findById: jest.fn(), save: jest.fn() },
        },
      ],
    }).compile();

    consumer = module.get<ReceiptReviewConsumer>(ReceiptReviewConsumer);
    jobRepo = module.get<IngestionJobRepository>(IngestionJobRepository);
  });

  it('registers for receipt.needs_review events on init', () => {
    consumer.onModuleInit();
    const router = (consumer as unknown as { router: MessageRouter }).router;
    expect(router.register).toHaveBeenCalledWith(
      'receipt.needs_review',
      expect.any(Function),
    );
  });

  it('marks low-confidence receipt jobs as needs_review', async () => {
    const job = { id: 'job-123', status: 'pending' };
    (jobRepo.findById as jest.Mock).mockResolvedValue(job);
    const payload: NeedsReviewPayload = {
      jobId: 'job-123',
      userId: 'user-456',
      confidence: 0.55,
      rawText: 'Starbucks $12.50',
      receipt: {
        merchant: 'Starbucks',
        purchasedAt: '2026-05-05T10:30:00Z',
        total: 12.5,
        currency: 'USD',
        lineItems: [],
        confidence: 0.55,
        discrepancy: null,
      },
    };
    const envelope: EventEnvelope<NeedsReviewPayload> = {
      eventId: 'evt-1',
      eventType: 'receipt.needs_review',
      correlationId: 'corr-123',
      schemaVersion: 1,
      attempt: 1,
      createdAt: new Date().toISOString(),
      payload,
    };

    await consumer.handleNeedsReview(envelope);

    expect(jobRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'needs_review',
        classification: 'receipt',
        extractedText: 'Starbucks $12.50',
      }),
    );
  });
});
