import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { IngestionService } from '@modules/ingestion/ingestion.service';
import { EventType } from '@modules/common/event-types';
import { IngestionJobStatus } from './ingestion.types';
import { IngestionJobRepository } from '@repositories/ingestion-job.repository';
import { MessageQueueService } from '@modules/message-queue';
import { ObjectStorageService } from '../storage/object-storage.service';

describe('IngestionService', () => {
  const input = {
    storageKey: 'raw/user-123/file-123.pdf',
    originalFilename: 'statement.pdf',
    mimeType: 'application/pdf',
    checksumSha256: 'a'.repeat(64),
  };

  it('creates a job from an existing object and publishes requested work', async () => {
    const createOrGetByChecksum = jest.fn().mockResolvedValue({
      job: { id: 'job-123' },
      created: true,
    });
    const publish = jest.fn().mockResolvedValue({ eventId: 'event-123' });
    const getObjectMetadata = jest.fn().mockResolvedValue({
      contentType: 'application/pdf',
      size: 1234,
    });
    const service = new IngestionService(
      { createOrGetByChecksum } as unknown as IngestionJobRepository,
      { publish } as unknown as MessageQueueService,
      { getObjectMetadata } as unknown as ObjectStorageService,
    );

    const result = await service.createJobFromObject(
      input,
      'user-123',
      'corr-123',
    );

    expect(createOrGetByChecksum).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'file-123',
        userId: 'user-123',
        storageKey: input.storageKey,
        checksumSha256: input.checksumSha256,
      }),
    );
    expect(publish).toHaveBeenCalledWith(
      'doc.pdf.parse.requested',
      expect.objectContaining({
        jobId: 'job-123',
        storageKey: input.storageKey,
        fileSize: 1234,
      }),
      'corr-123',
      1,
      1,
    );
    expect(result.deduplicated).toBe(false);
  });

  it('does not publish a duplicate object ingestion job', async () => {
    const createOrGetByChecksum = jest.fn().mockResolvedValue({
      job: { id: 'job-existing' },
      created: false,
    });
    const publish = jest.fn();
    const service = new IngestionService(
      { createOrGetByChecksum } as unknown as IngestionJobRepository,
      { publish } as unknown as MessageQueueService,
      {
        getObjectMetadata: jest.fn().mockResolvedValue({
          contentType: 'application/pdf',
          size: 1234,
        }),
      } as unknown as ObjectStorageService,
    );

    const result = await service.createJobFromObject(input, 'user-123');

    expect(result).toEqual({ job: { id: 'job-existing' }, deduplicated: true });
    expect(publish).not.toHaveBeenCalled();
  });

  it('rejects an object key outside the authenticated user prefix', async () => {
    const getObjectMetadata = jest.fn();
    const service = new IngestionService(
      {} as IngestionJobRepository,
      {} as MessageQueueService,
      { getObjectMetadata } as unknown as ObjectStorageService,
    );

    await expect(
      service.createJobFromObject(input, 'another-user'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(getObjectMetadata).not.toHaveBeenCalled();
  });

  it('rejects object content whose type differs from the request', async () => {
    const service = new IngestionService(
      {} as IngestionJobRepository,
      {} as MessageQueueService,
      {
        getObjectMetadata: jest.fn().mockResolvedValue({
          contentType: 'image/png',
        }),
      } as unknown as ObjectStorageService,
    );

    await expect(
      service.createJobFromObject(input, 'user-123'),
    ).rejects.toThrow(
      'Object content type does not match the ingestion request',
    );
  });

  function pendingReviewJob() {
    return {
      id: 'job-123',
      userId: 'user-123',
      status: IngestionJobStatus.NEEDS_REVIEW,
      correlationId: 'corr-123',
      completedAt: null,
      metadata: {
        size: 1234,
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
          rawText: 'Starbucks $12.50',
          confidence: 0.55,
          status: 'pending',
          requestedAt: '2026-05-05T10:35:00.000Z',
        },
      },
    };
  }

  function pendingPaymentReviewJob() {
    return {
      id: 'payment-job-123',
      userId: 'user-123',
      status: IngestionJobStatus.NEEDS_REVIEW,
      correlationId: 'payment-corr-123',
      completedAt: null,
      metadata: {
        paymentReview: {
          payment: {
            merchant: 'Power Company',
            purchasedAt: '2026-05-05T10:30:00Z',
            total: 125_000,
            currency: 'VND',
            confidence: 0.92,
          },
          rawText: 'Bank transfer 125000 VND to Power Company',
          status: 'pending',
          requestedAt: '2026-05-05T10:35:00.000Z',
        },
      },
    };
  }

  it('returns the pending receipt review to its owner', async () => {
    const job = pendingReviewJob();
    const service = new IngestionService(
      { findById: jest.fn().mockResolvedValue(job) } as never,
      {} as MessageQueueService,
      {} as ObjectStorageService,
    );

    const result = await service.getNeedsReview('job-123', 'user-123');
    expect(result.job).toBe(job);
    expect(result.review.status).toBe('pending');
  });

  it('does not expose a receipt review to another user', async () => {
    const service = new IngestionService(
      { findById: jest.fn().mockResolvedValue(pendingReviewJob()) } as never,
      {} as MessageQueueService,
      {} as ObjectStorageService,
    );

    await expect(
      service.getNeedsReview('job-123', 'other-user'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('approves a review and queues the approved receipt', async () => {
    const job = pendingReviewJob();
    const save = jest.fn().mockResolvedValue(job);
    const publish = jest.fn().mockResolvedValue({ eventId: 'evt-123' });
    const service = new IngestionService(
      {
        findById: jest.fn().mockResolvedValue(job),
        save,
      } as never,
      { publish } as unknown as MessageQueueService,
      {} as ObjectStorageService,
    );

    const result = await service.resolveNeedsReview('job-123', 'user-123', {
      action: 'approve',
    });

    expect(result.job.status).toBe(IngestionJobStatus.PROCESSING);
    expect(result.review.status).toBe('approved');
    const saveCalls = save.mock.calls as unknown as Array<
      [
        {
          status: IngestionJobStatus;
          metadata: { needsReview: { status: string } };
        },
      ]
    >;
    const savedJob = saveCalls[0]?.[0] as {
      status: IngestionJobStatus;
      metadata: { needsReview: { status: string } };
    };
    const publishCall = publish.mock.calls[0] as [
      EventType,
      {
        jobId: string;
        userId: string;
        receipt: { merchant: string };
        rawText: string;
      },
      string,
      number,
      number,
    ];
    expect(savedJob.status).toBe(IngestionJobStatus.PROCESSING);
    expect(savedJob.metadata.needsReview.status).toBe('approved');
    expect(publishCall).toEqual([
      EventType.RECEIPT_PARSED,
      expect.objectContaining({
        jobId: 'job-123',
        userId: 'user-123',
        rawText: 'Starbucks $12.50',
      }),
      'corr-123',
      1,
      1,
    ]);
    expect(publishCall[1].receipt.merchant).toBe('Starbucks');
  });

  it('uses a corrected receipt supplied during approval', async () => {
    const job = pendingReviewJob();
    const publish = jest.fn().mockResolvedValue({ eventId: 'evt-123' });
    const service = new IngestionService(
      { findById: jest.fn().mockResolvedValue(job), save: jest.fn() } as never,
      { publish } as unknown as MessageQueueService,
      {} as ObjectStorageService,
    );

    await service.resolveNeedsReview('job-123', 'user-123', {
      action: 'approve',
      receipt: {
        ...job.metadata.needsReview.receipt,
        merchant: 'Corrected merchant',
      },
    });

    const publishCall = publish.mock.calls[0] as [
      EventType,
      { receipt: { merchant: string } },
    ];
    expect(publishCall[0]).toBe(EventType.RECEIPT_PARSED);
    expect(publishCall[1].receipt.merchant).toBe('Corrected merchant');
  });

  it('restores the pending review when approval cannot be queued', async () => {
    const job = pendingReviewJob();
    const save = jest.fn().mockResolvedValue(job);
    const service = new IngestionService(
      { findById: jest.fn().mockResolvedValue(job), save } as never,
      {
        publish: jest.fn().mockRejectedValue(new Error('Broker unavailable')),
      } as unknown as MessageQueueService,
      {} as ObjectStorageService,
    );

    await expect(
      service.resolveNeedsReview('job-123', 'user-123', {
        action: 'approve',
      }),
    ).rejects.toThrow('Broker unavailable');
    const saveCalls = save.mock.calls as unknown as Array<
      [
        {
          status: IngestionJobStatus;
          metadata: { needsReview: { status: string } };
        },
      ]
    >;
    const savedJob = saveCalls.at(-1)?.[0] as {
      status: IngestionJobStatus;
      metadata: { needsReview: { status: string } };
    };
    expect(savedJob.status).toBe(IngestionJobStatus.NEEDS_REVIEW);
    expect(savedJob.metadata.needsReview.status).toBe('pending');
  });

  it('rejects a review without publishing a receipt event', async () => {
    const job = pendingReviewJob();
    const save = jest.fn().mockResolvedValue(job);
    const publish = jest.fn();
    const service = new IngestionService(
      { findById: jest.fn().mockResolvedValue(job), save } as never,
      { publish } as unknown as MessageQueueService,
      {} as ObjectStorageService,
    );

    const result = await service.resolveNeedsReview('job-123', 'user-123', {
      action: 'reject',
    });

    expect(result.job.status).toBe(IngestionJobStatus.REJECTED);
    expect(result.job.completedAt).toBeInstanceOf(Date);
    expect(result.review.status).toBe('rejected');
    expect(publish).not.toHaveBeenCalled();
  });

  it('rejects invalid and already resolved review decisions', async () => {
    const job = pendingReviewJob();
    const service = new IngestionService(
      { findById: jest.fn().mockResolvedValue(job) } as never,
      {} as MessageQueueService,
      {} as ObjectStorageService,
    );

    await expect(
      service.resolveNeedsReview('job-123', 'user-123', {
        action: 'reject',
        receipt: {},
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    job.metadata.needsReview.status = 'approved';
    await expect(
      service.resolveNeedsReview('job-123', 'user-123', { action: 'approve' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('turns an approved bank transfer into a one-item receipt', async () => {
    const job = pendingPaymentReviewJob();
    const save = jest.fn().mockResolvedValue(job);
    const publish = jest.fn().mockResolvedValue({ eventId: 'evt-payment-123' });
    const service = new IngestionService(
      { findById: jest.fn().mockResolvedValue(job), save } as never,
      { publish } as unknown as MessageQueueService,
      {} as ObjectStorageService,
    );

    const result = await service.resolvePaymentReview(
      'payment-job-123',
      'user-123',
      { action: 'approve', itemName: 'Electricity bill' },
    );

    expect(result.job.status).toBe(IngestionJobStatus.PROCESSING);
    expect(result.review.status).toBe('approved');
    expect(publish).toHaveBeenCalledWith(
      EventType.RECEIPT_PARSED,
      expect.objectContaining({
        jobId: 'payment-job-123',
        userId: 'user-123',
        rawText: 'Bank transfer 125000 VND to Power Company',
        receipt: {
          merchant: 'Power Company',
          purchasedAt: '2026-05-05T10:30:00Z',
          total: 125_000,
          tax: null,
          currency: 'VND',
          lineItems: [
            {
              name: 'Electricity bill',
              quantity: 1,
              unitPrice: 125_000,
              totalPrice: 125_000,
            },
          ],
          confidence: 0.92,
          discrepancy: null,
        },
      }),
      'payment-corr-123',
      1,
      1,
    );
  });

  it('requires an item name to approve a bank transfer', async () => {
    const service = new IngestionService(
      {
        findById: jest.fn().mockResolvedValue(pendingPaymentReviewJob()),
      } as never,
      {} as MessageQueueService,
      {} as ObjectStorageService,
    );

    await expect(
      service.resolvePaymentReview('payment-job-123', 'user-123', {
        action: 'approve',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
