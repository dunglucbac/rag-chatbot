import { Test, TestingModule } from '@nestjs/testing';
import { ReceiptReviewConsumer } from './receipt-review.consumer';
import { MessageRouter } from '../message-queue/router/message-router.service';
import { IngestionJobRepository } from '../repositories/ingestion-job.repository';
import { NeedsReviewPayload } from '@modules/common/event-payloads.types';
import { EventEnvelope } from '@modules/common/common.types';
import { EventType } from '@modules/common/event-types';

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
      EventType.RECEIPT_NEEDS_REVIEW,
      expect.any(Function),
    );
  });

  it('marks low-confidence receipt jobs as needs_review', async () => {
    const job = { id: 'job-123', userId: 'user-456', status: 'pending' };
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
      eventType: EventType.RECEIPT_NEEDS_REVIEW,
      correlationId: 'corr-123',
      schemaVersion: 1,
      attempt: 1,
      createdAt: new Date().toISOString(),
      payload,
    };

    await consumer.handleNeedsReview(envelope);

    const saveCalls = (jobRepo.save as jest.Mock).mock
      .calls as unknown as Array<
      [
        {
          status: string;
          classification: string;
          extractedText: string;
          metadata: { needsReview: Record<string, unknown> };
        },
      ]
    >;
    const savedJob = saveCalls[0]?.[0] as {
      status: string;
      classification: string;
      extractedText: string;
      metadata: { needsReview: Record<string, unknown> };
    };
    expect(savedJob.status).toBe('needs_review');
    expect(savedJob.classification).toBe('receipt');
    expect(savedJob.extractedText).toBe('Starbucks $12.50');
    expect(savedJob.metadata.needsReview).toEqual(
      expect.objectContaining({
        confidence: 0.55,
        rawText: 'Starbucks $12.50',
        status: 'pending',
        receipt: payload.receipt,
      }),
    );
  });

  it('ignores an event whose user does not own the ingestion job', async () => {
    (jobRepo.findById as jest.Mock).mockResolvedValue({
      id: 'job-123',
      userId: 'other-user',
    });

    await consumer.handleNeedsReview({
      eventId: 'evt-1',
      eventType: EventType.RECEIPT_NEEDS_REVIEW,
      correlationId: 'corr-123',
      schemaVersion: 1,
      attempt: 1,
      createdAt: new Date().toISOString(),
      payload: {
        jobId: 'job-123',
        userId: 'user-456',
        confidence: 0.55,
        receipt: {
          merchant: 'Starbucks',
          purchasedAt: '2026-05-05T10:30:00Z',
          total: 12.5,
          currency: 'USD',
          lineItems: [],
          confidence: 0.55,
          discrepancy: null,
        },
      },
    });

    expect(jobRepo.save).not.toHaveBeenCalled();
  });

  it('does not reopen an already resolved review', async () => {
    (jobRepo.findById as jest.Mock).mockResolvedValue({
      id: 'job-123',
      userId: 'user-456',
      metadata: {
        needsReview: {
          receipt: {
            merchant: 'Starbucks',
            purchasedAt: '2026-05-05T10:30:00Z',
            total: 12.5,
            currency: 'USD',
            lineItems: [],
            confidence: 0.55,
            discrepancy: null,
          },
          rawText: null,
          confidence: 0.55,
          status: 'approved',
          requestedAt: '2026-05-05T10:35:00.000Z',
          resolvedAt: '2026-05-05T10:40:00.000Z',
        },
      },
    });

    await consumer.handleNeedsReview({
      eventId: 'evt-1',
      eventType: EventType.RECEIPT_NEEDS_REVIEW,
      correlationId: 'corr-123',
      schemaVersion: 1,
      attempt: 1,
      createdAt: new Date().toISOString(),
      payload: {
        jobId: 'job-123',
        userId: 'user-456',
        confidence: 0.55,
        receipt: {
          merchant: 'Starbucks',
          purchasedAt: '2026-05-05T10:30:00Z',
          total: 12.5,
          currency: 'USD',
          lineItems: [],
          confidence: 0.55,
          discrepancy: null,
        },
      },
    });

    expect(jobRepo.save).not.toHaveBeenCalled();
  });
});
