import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import type {
  ReceiptParsedPayload,
  ReceiptLineItem,
} from '@modules/common/event-payloads.types';
import { IngestionJob } from '@modules/ingestion/entities/ingestion-job.entity';
import {
  IngestionClassification,
  IngestionJobStatus,
} from '@modules/ingestion/ingestion.types';
import { Receipt } from './entities/receipt.entity';
import { ReceiptCategorizationStatus } from './entities/receipt-item.entity';
import { MessageQueueService } from '../message-queue/publisher/publisher.service';

@Injectable()
export class ReceiptService {
  private readonly logger = new Logger(ReceiptService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly messageQueueService: MessageQueueService,
  ) {}

  async saveFromEvent(eventData: ReceiptParsedPayload) {
    const { jobId, userId, receipt, rawText } = eventData;
    const lineItems = receipt.lineItems;

    const outcome = await this.dataSource.transaction(async (manager) => {
      const receiptRepository = manager.getRepository(Receipt);
      const existingReceipt = await receiptRepository.findOneBy({
        ingestionJobId: jobId,
      });
      if (existingReceipt) {
        return { receipt: existingReceipt, newlyCreated: false };
      }

      const checksumContent =
        rawText || JSON.stringify({ userId, receipt, lineItems });
      const checksumSha256 = createHash('sha256')
        .update(checksumContent)
        .digest('hex');
      const duplicateReceipt = await receiptRepository.findOneBy({
        userId,
        merchant: receipt.merchant,
        purchasedAt: new Date(receipt.purchasedAt),
        total: receipt.total,
        checksumSha256,
      });
      if (duplicateReceipt) {
        await this.completeIngestionJob(manager, jobId, rawText);
        return { receipt: duplicateReceipt, newlyCreated: false };
      }
      const receiptEntity = receiptRepository.create({
        userId,
        ingestionJobId: jobId,
        merchant: receipt.merchant,
        purchasedAt: new Date(receipt.purchasedAt),
        total: receipt.total,
        tax: receipt.tax ?? null,
        currency: receipt.currency,
        source: 'ingestion',
        rawText: rawText ?? null,
        checksumSha256,
        items: lineItems.map((item: ReceiptLineItem) => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          category: null,
          subcategory: null,
          categorizationStatus: ReceiptCategorizationStatus.PENDING,
          categoryConfidence: null,
          taxonomyVersion: null,
          classificationMetadata: item.category
            ? { extractedCategory: item.category }
            : null,
        })),
      });
      const savedReceipt = await receiptRepository.save(receiptEntity);

      await this.completeIngestionJob(manager, jobId, rawText);

      return { receipt: savedReceipt, newlyCreated: true };
    });

    if (outcome.newlyCreated) {
      await this.messageQueueService
        .publish(
          'receipt.items.categorize',
          { receiptId: outcome.receipt.id, userId },
          jobId,
          1,
          1,
        )
        .catch(() => {
          this.logger.error(
            `Unable to queue receipt categorization [jobId=${jobId}]`,
          );
        });
    }

    return outcome.receipt;
  }

  private async completeIngestionJob(
    manager: EntityManager,
    jobId: string,
    rawText: string | undefined,
  ): Promise<void> {
    const jobUpdate = {
      status: IngestionJobStatus.COMPLETED,
      classification: IngestionClassification.RECEIPT,
      completedAt: new Date(),
      ...(rawText !== undefined ? { extractedText: rawText } : {}),
    };
    const updateResult = await manager
      .createQueryBuilder()
      .update(IngestionJob)
      .set(jobUpdate)
      .where('id = :jobId', { jobId })
      .execute();
    if (!updateResult.affected) {
      throw new Error(`Ingestion job not found: ${jobId}`);
    }
  }
}
