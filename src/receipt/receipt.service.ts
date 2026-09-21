import { Injectable } from '@nestjs/common';
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

@Injectable()
export class ReceiptService {
  constructor(private readonly dataSource: DataSource) {}

  async saveFromEvent(eventData: ReceiptParsedPayload) {
    const { jobId, userId, receipt, rawText } = eventData;
    const lineItems = receipt.lineItems;

    return this.dataSource.transaction(async (manager) => {
      const receiptRepository = manager.getRepository(Receipt);
      const existingReceipt = await receiptRepository.findOneBy({
        ingestionJobId: jobId,
      });
      if (existingReceipt) {
        return existingReceipt;
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
        return duplicateReceipt;
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
          category: item.category,
        })),
      });
      const savedReceipt = await receiptRepository.save(receiptEntity);

      await this.completeIngestionJob(manager, jobId, rawText);

      return savedReceipt;
    });
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
