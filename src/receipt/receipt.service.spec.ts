import { DataSource } from 'typeorm';
import { ReceiptService } from './receipt.service';
import { Receipt } from './entities/receipt.entity';

describe('ReceiptService', () => {
  let service: ReceiptService;
  let dataSource: DataSource;
  let receiptRepository: {
    findOneBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let updateIngestionJob: jest.Mock;

  beforeEach(() => {
    receiptRepository = {
      findOneBy: jest.fn().mockResolvedValue(null),
      create: jest.fn((receipt) => receipt),
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
      transaction: jest.fn((callback) => callback(manager)),
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
    const createCall = receiptRepository.create.mock.calls[0][0];
    expect(createCall.items).toBeDefined();
    expect(createCall.items).toHaveLength(2);
    expect(createCall.items[0].name).toBe('Latte');
  });

  it('rejects duplicate receipts', async () => {
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

    const duplicateError = new Error(
      'duplicate key value violates unique constraint',
    );
    (duplicateError as any).code = '23505';
    receiptRepository.save.mockRejectedValue(duplicateError);

    await expect(service.saveFromEvent(eventData)).rejects.toThrow('duplicate');
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

    const createCall = receiptRepository.create.mock.calls[0][0];
    expect(createCall.checksumSha256).toBeDefined();
    expect(createCall.checksumSha256).not.toBe('job-123');
    expect(createCall.checksumSha256.length).toBe(64); // SHA256 hex length
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
