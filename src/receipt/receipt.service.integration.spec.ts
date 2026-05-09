import { DataSource } from 'typeorm';
import { Receipt } from './entities/receipt.entity';
import { ReceiptItem } from './entities/receipt-item.entity';
import { ReceiptRepository } from './repositories/receipt.repository';
import { ReceiptService } from './receipt.service';

describe('ReceiptService Integration', () => {
  let dataSource: DataSource;
  let repository: ReceiptRepository;
  let service: ReceiptService;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [Receipt, ReceiptItem],
      synchronize: true,
      logging: false,
    });
    await dataSource.initialize();
    repository = new ReceiptRepository(dataSource.getRepository(Receipt));
    service = new ReceiptService(repository);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.getRepository(ReceiptItem).clear();
    await dataSource.getRepository(Receipt).clear();
  });

  it('saves a receipt with line items from a parsed event', async () => {
    const event = {
      jobId: 'job-123',
      userId: 'user-456',
      rawText: 'Starbucks\nLatte $4.50\nTotal $12.50',
      receipt: {
        merchant: 'Starbucks',
        purchasedAt: '2026-05-05T10:30:00Z',
        total: 12.50,
        tax: 1.15,
        currency: 'USD',
      },
      lineItems: [
        { name: 'Latte', quantity: 1, unitPrice: 4.50, totalPrice: 4.50 },
      ],
    };

    const result = await service.saveFromEvent(event);

    expect(result.id).toBeDefined();
    expect(result.merchant).toBe('Starbucks');
    expect(result.total).toBe(12.50);

    const found = await dataSource.getRepository(Receipt).findOne({
      where: { id: result.id },
      relations: ['items'],
    });
    expect(found?.items).toHaveLength(1);
    expect(found?.items[0].name).toBe('Latte');
    expect(found?.items[0].totalPrice).toBe(4.50);
  });

  it('detects duplicate receipts via composite unique constraint', async () => {
    const event = {
      jobId: 'job-dup',
      userId: 'user-456',
      rawText: 'Same receipt content',
      receipt: {
        merchant: 'Target',
        purchasedAt: '2026-05-06T14:00:00Z',
        total: 50.00,
        currency: 'USD',
      },
      lineItems: [],
    };

    // First save succeeds
    await service.saveFromEvent(event);

    // Second save with same content produces same checksum, should fail
    await expect(service.saveFromEvent(event)).rejects.toThrow();
  });

  it('validates checksum consistency across saves', async () => {
    const event1 = {
      jobId: 'job-1',
      userId: 'user-456',
      rawText: 'Receipt A content',
      receipt: {
        merchant: 'Walmart',
        purchasedAt: '2026-05-06T14:00:00Z',
        total: 50.00,
        currency: 'USD',
      },
      lineItems: [],
    };

    const event2 = {
      ...event1,
      rawText: 'Receipt B content - different file',
    };

    const saved1 = await service.saveFromEvent(event1);
    const saved2 = await service.saveFromEvent(event2);

    expect(saved1.checksumSha256).not.toBe(saved2.checksumSha256);
  });

  it('same content produces identical checksum', async () => {
    const event = {
      jobId: 'job-same',
      userId: 'user-456',
      rawText: 'Identical receipt content',
      receipt: {
        merchant: 'Costco',
        purchasedAt: '2026-05-06T14:00:00Z',
        total: 100.00,
        currency: 'USD',
      },
      lineItems: [],
    };

    const saved1 = await service.saveFromEvent(event);

    // Clear the first save so we can save again
    await dataSource.getRepository(Receipt).clear();

    const saved2 = await service.saveFromEvent(event);

    expect(saved1.checksumSha256).toBe(saved2.checksumSha256);
  });
});
