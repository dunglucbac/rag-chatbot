import { NotFoundException } from '@nestjs/common';
import { IngestionService } from '../../ingestion/ingestion.service';
import {
  IngestionClassification,
  IngestionJobStatus,
} from '../../ingestion/ingestion.types';
import {
  createIngestionReviewTool,
  createResolveIngestionReviewTool,
} from './ingestion-review.tool';

const job = {
  id: 'job-1',
  originalFilename: 'market.jpg',
  fileType: 'image',
  classification: IngestionClassification.RECEIPT,
  status: IngestionJobStatus.NEEDS_REVIEW,
  errorMessage: null,
};

describe('ingestion review tools', () => {
  it('returns only the UI-selected, user-scoped receipt proposal', async () => {
    const ingestion = {
      getJob: jest.fn().mockResolvedValue(job),
      getNeedsReview: jest.fn().mockResolvedValue({
        review: {
          receipt: {
            merchant: 'Market',
            purchasedAt: '2026-09-20T03:00:00.000Z',
            total: 25_000,
            currency: 'VND',
            lineItems: [],
            confidence: 0.6,
            discrepancy: null,
          },
          confidence: 0.6,
          requestedAt: '2026-09-20T03:01:00.000Z',
        },
      }),
    } as unknown as IngestionService;

    const result = await createIngestionReviewTool(
      ingestion,
      'user-1',
      'job-1',
    ).invoke({});

    expect(ingestion.getJob).toHaveBeenCalledWith('job-1', 'user-1');
    expect(ingestion.getNeedsReview).toHaveBeenCalledWith('job-1', 'user-1');
    expect(result).toMatchObject({
      status: 'success',
      data: { job: { id: 'job-1' }, review: { confidence: 0.6 } },
    });
  });

  it('reports a payment-style review without pretending it has receipt data', async () => {
    const ingestion = {
      getJob: jest.fn().mockResolvedValue({
        ...job,
        classification: IngestionClassification.PAYMENT,
      }),
      getNeedsReview: jest.fn().mockRejectedValue(new NotFoundException()),
    } as unknown as IngestionService;

    const result = await createIngestionReviewTool(
      ingestion,
      'user-1',
      'job-1',
    ).invoke({});

    expect(result).toMatchObject({
      status: 'success',
      data: { review: null },
      warnings: [{ code: 'NO_RECEIPT_REVIEW_DATA' }],
    });
  });

  it('uses the UI-confirmed action and never accepts an action from model input', async () => {
    const ingestion = {
      resolveNeedsReview: jest.fn().mockResolvedValue({
        job: { ...job, status: IngestionJobStatus.PROCESSING },
        review: { status: 'approved', resolvedAt: '2026-09-20T03:02:00.000Z' },
      }),
    } as unknown as IngestionService;

    const result = await createResolveIngestionReviewTool(
      ingestion,
      'user-1',
      'job-1',
      'approve',
    ).invoke({});

    expect(ingestion.resolveNeedsReview).toHaveBeenCalledWith(
      'job-1',
      'user-1',
      {
        action: 'approve',
      },
    );
    expect(result).toMatchObject({
      status: 'success',
      data: { review: { status: 'approved' } },
    });
  });
});
