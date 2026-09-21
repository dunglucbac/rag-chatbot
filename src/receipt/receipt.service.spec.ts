import { DataSource } from 'typeorm';
import { ReceiptService } from './receipt.service';

type ReceiptCreateInput = {
  items: Array<{ name: string }>;
  checksumSha256: string;
  [key: string]: unknown;
};

describe('ReceiptService', () => {
  let service: ReceiptService;
  let dataSource: DataSource;
  let receiptRepository: {
    findOneBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let updateIngestionJob: jest.Mock;
  let createdReceipt: ReceiptCreateInput | undefined;

  beforeEach(() => {
    createdReceipt = undefined;
    receiptRepository = {
      findOneBy: jest.fn().mockResolvedValue(null),
      create: jest.fn((receipt: ReceiptCreateInput) => {
        createdReceipt = receipt;
        return receipt;
      }),
      save: jest.fn(),
    };
    updateIngestionJob = jest.fn().mockResolvedValue({ affected: 1 });
    const manager = {
      getRepository: jest.fn(() => receiptRepository),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: updateIngestionJob,
      })),
    };
    dataSource = {
      transaction: jest.fn(
        (callback: (transactionManager: typeof manager) => unknown) =>
          callback(manager),
      ),
    } as unknown as DataSource;

    service = new ReceiptService(dataSource);
  });

  it('can save a receipt from parsed event data', async () => {
    const eventData = {
      jobId: 'job-123',
      userId: 'user-456',
      receipt: {
        merchant: 'Starbucks',
        purchasedAt: '2026-05-05T10:30:00Z',
        total: 12.5,
        tax: 1.15,
        currency: 'USD',
        lineItems: [
          { name: 'Latte', quantity: 1, unitPrice: 4.5, totalPrice: 4.5 },
        ],
        confidence: 1,
        discrepancy: null,
      },
    };

    const mockReceipt = { id: 'receipt-123', ...eventData.receipt };
    receiptRepository.save.mockResolvedValue(mockReceipt);

    const result = await service.saveFromEvent(eventData);

    expect(result.id).toBe('receipt-123');
    expect(receiptRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-456',
        merchant: 'Starbucks',
        total: 12.5,
        source: 'ingestion',
        ingestionJobId: 'job-123',
      }),
    );
  });

  it('saves receipt items along with the receipt', async () => {
    const eventData = {
      jobId: 'job-123',
      userId: 'user-456',
      receipt: {
        merchant: 'Starbucks',
        purchasedAt: '2026-05-05T10:30:00Z',
        total: 12.5,
        currency: 'USD',
        lineItems: [
          { name: 'Latte', quantity: 1, unitPrice: 4.5, totalPrice: 4.5 },
          { name: 'Croissant', quantity: 2, unitPrice: 3.0, totalPrice: 6.0 },
        ],
        confidence: 1,
        discrepancy: null,
      },
    };

    const mockReceipt = { id: 'receipt-123', ...eventData.receipt };
    receiptRepository.save.mockResolvedValue(mockReceipt);

    const result = await service.saveFromEvent(eventData);

    expect(result.id).toBe('receipt-123');
    // Verify receipt was created with line items
    expect(createdReceipt).toBeDefined();
    if (!createdReceipt) throw new Error('Receipt was not created');
    expect(createdReceipt.items).toHaveLength(2);
    expect(createdReceipt.items[0].name).toBe('Latte');
  });

  it('returns an existing matching receipt instead of failing the consumer', async () => {
    const eventData = {
      jobId: 'job-123',
      userId: 'user-456',
      receipt: {
        merchant: 'Starbucks',
        purchasedAt: '2026-05-05T10:30:00Z',
        total: 12.5,
        currency: 'USD',
        lineItems: [],
        confidence: 1,
        discrepancy: null,
      },
    };

    const existingReceipt = { id: 'receipt-existing' };
    receiptRepository.findOneBy
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingReceipt);

    await expect(service.saveFromEvent(eventData)).resolves.toBe(
      existingReceipt,
    );
    expect(receiptRepository.save).not.toHaveBeenCalled();
    expect(updateIngestionJob).toHaveBeenCalledTimes(1);
  });

  it('calculates checksum from receipt content', async () => {
    const eventData = {
      jobId: 'job-123',
      userId: 'user-456',
      rawText: 'Starbucks Receipt\nTotal: $12.50',
      receipt: {
        merchant: 'Starbucks',
        purchasedAt: '2026-05-05T10:30:00Z',
        total: 12.5,
        currency: 'USD',
        lineItems: [],
        confidence: 1,
        discrepancy: null,
      },
    };

    const mockReceipt = { id: 'receipt-123' };
    receiptRepository.save.mockResolvedValue(mockReceipt);

    await service.saveFromEvent(eventData);

    expect(createdReceipt).toBeDefined();
    if (!createdReceipt) throw new Error('Receipt was not created');
    expect(createdReceipt.checksumSha256).not.toBe('job-123');
    expect(createdReceipt.checksumSha256).toHaveLength(64);
  });

  it('is idempotent for a redelivered ingestion job', async () => {
    const existingReceipt = { id: 'receipt-existing' };
    receiptRepository.findOneBy.mockResolvedValue(existingReceipt);

    const result = await service.saveFromEvent({
      jobId: 'job-123',
      userId: 'user-456',
      receipt: {
        merchant: 'Starbucks',
        purchasedAt: '2026-05-05T10:30:00Z',
        total: 12.5,
        currency: 'USD',
        lineItems: [],
        confidence: 1,
        discrepancy: null,
      },
    });

    expect(result).toBe(existingReceipt);
    expect(receiptRepository.save).not.toHaveBeenCalled();
    expect(updateIngestionJob).not.toHaveBeenCalled();
  });

  it('persists the receipt and completes its ingestion job in one transaction', async () => {
    receiptRepository.save.mockResolvedValue({ id: 'receipt-123' });

    await service.saveFromEvent({
      jobId: 'job-123',
      userId: 'user-456',
      rawText: 'Starbucks receipt',
      receipt: {
        merchant: 'Starbucks',
        purchasedAt: '2026-05-05T10:30:00Z',
        total: 12.5,
        currency: 'USD',
        lineItems: [],
        confidence: 1,
        discrepancy: null,
      },
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(updateIngestionJob).toHaveBeenCalledTimes(1);
  });
});
