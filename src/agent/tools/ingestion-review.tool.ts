import { tool } from '@langchain/core/tools';
import { NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { IngestionService } from '../../ingestion/ingestion.service';
import { IngestionJobStatus } from '../../ingestion/ingestion.types';

const noArgumentsSchema = z.object({}).strict();

function jobSummary(job: {
  id: string;
  originalFilename: string;
  fileType: string;
  classification: string;
  status: string;
  errorMessage: string | null;
}) {
  return {
    id: job.id,
    originalFilename: job.originalFilename,
    fileType: job.fileType,
    classification: job.classification,
    status: job.status,
    errorMessage: job.errorMessage,
  };
}

/**
 * Creates tools that are permanently bound to the authenticated user and one
 * job ID supplied by the UI. The LLM therefore cannot select another job or
 * another user's upload.
 */
export function createIngestionReviewTool(
  ingestion: IngestionService,
  userId: string,
  jobId: string,
) {
  return tool(
    async () => {
      const job = await ingestion.getJob(jobId, userId);
      if (job.status !== IngestionJobStatus.NEEDS_REVIEW) {
        return {
          status: 'success' as const,
          data: { job: jobSummary(job), review: null },
        };
      }

      if (job.classification === 'payment') {
        try {
          const { review } = await ingestion.getPaymentReview(jobId, userId);
          return {
            status: 'success' as const,
            data: {
              job: jobSummary(job),
              review: {
                payment: review.payment,
                requestedAt: review.requestedAt,
              },
            },
          };
        } catch (error: unknown) {
          if (!(error instanceof NotFoundException)) {
            throw error;
          }
          return missingReviewData(job);
        }
      }

      try {
        const { review } = await ingestion.getNeedsReview(jobId, userId);
        return {
          status: 'success' as const,
          data: {
            job: jobSummary(job),
            review: {
              receipt: review.receipt,
              confidence: review.confidence,
              requestedAt: review.requestedAt,
            },
          },
        };
      } catch (error: unknown) {
        if (!(error instanceof NotFoundException)) {
          throw error;
        }
        return missingReviewData(job);
      }
    },
    {
      name: 'get_ingestion_review',
      description:
        "Get the authenticated user's UI-selected ingestion job and, when it is a pending receipt review, its proposed parsed receipt data. Use before answering questions about the selected upload.",
      schema: noArgumentsSchema,
    },
  );
}

function missingReviewData(job: Parameters<typeof jobSummary>[0]) {
  return {
    status: 'success' as const,
    data: { job: jobSummary(job), review: null },
    warnings: [
      {
        code: 'NO_REVIEW_DATA',
        message:
          'This job requires attention but has no proposed data to review.',
      },
    ],
  };
}

export function createResolveIngestionReviewTool(
  ingestion: IngestionService,
  userId: string,
  jobId: string,
  action: 'approve' | 'reject',
) {
  return tool(
    async () => {
      const { job, review } = await ingestion.resolveNeedsReview(
        jobId,
        userId,
        {
          action,
        },
      );
      return {
        status: 'success' as const,
        data: {
          job: jobSummary(job),
          review: {
            status: review.status,
            resolvedAt: review.resolvedAt,
          },
        },
      };
    },
    {
      name: 'resolve_ingestion_review',
      description:
        'Apply the explicit approve or reject decision supplied by the UI to the selected pending receipt review. This action cannot alter the proposed receipt fields.',
      schema: noArgumentsSchema,
    },
  );
}

export function createResolvePaymentReviewTool(
  ingestion: IngestionService,
  userId: string,
  jobId: string,
  action: 'approve' | 'reject',
  itemName?: string,
) {
  return tool(
    async () => {
      const { job, review } = await ingestion.resolvePaymentReview(
        jobId,
        userId,
        {
          action,
          ...(itemName ? { itemName } : {}),
        },
      );
      return {
        status: 'success' as const,
        data: {
          job: jobSummary(job),
          review: {
            status: review.status,
            resolvedAt: review.resolvedAt,
          },
        },
      };
    },
    {
      name: 'resolve_payment_review',
      description:
        'Apply the explicit UI decision to the selected pending bank-transfer review. An approval creates a receipt with one user-supplied item and the detected transfer amount.',
      schema: noArgumentsSchema,
    },
  );
}
