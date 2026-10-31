import { DataSource } from 'typeorm';
import { Receipt } from './entities/receipt.entity';
import { ReceiptItem } from './entities/receipt-item.entity';
import { ReceiptBrowserService } from './receipt-browser.service';
import { MessageQueueService } from '../message-queue/publisher/publisher.service';

describe('Saved receipt browsing and editing', () => {
  let ds: DataSource;
  let service: ReceiptBrowserService;
  let publish: jest.Mock;
  const corrected = {
    merchant: 'Corner Market',
    purchasedAt: '2026-10-29T17:30:00.000Z',
    total: 42000,
    tax: null,
    currency: 'VND',
    confidence: 1,
    discrepancy: null,
    lineItems: [
      { name: 'Milk', quantity: 2, unitPrice: 21000, totalPrice: 42000 },
    ],
  };
  beforeEach(async () => {
    ds = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      entities: [Receipt, ReceiptItem],
    }).initialize();
    publish = jest.fn().mockResolvedValue({});
    service = new ReceiptBrowserService(ds, {
      publish,
    } as unknown as MessageQueueService);
  });
  afterEach(() => ds.destroy());
  async function seed(
    userId = 'owner',
    name = 'Milk 100%',
    purchasedAt = '2026-10-29T17:30:00.000Z',
  ) {
    return ds.getRepository(Receipt).save(
      ds.getRepository(Receipt).create({
        userId,
        merchant: 'Market',
        purchasedAt: new Date(purchasedAt),
        total: 21000,
        currency: 'VND',
        source: 'test',
        rawText: 'Private OCR contents',
        checksumSha256: `${userId}-${name}`,
        items: [{ name, quantity: 1, unitPrice: 21000, totalPrice: 21000 }],
      }),
    );
  }

  it('searches merchant and item names with literal wildcards while isolating users', async () => {
    await seed();
    await seed('other');
    await seed('owner', 'Unrelated purchase');
    expect(
      (await service.list('owner', { q: 'milk' }, 0)).receipts,
    ).toHaveLength(1);
    expect((await service.list('owner', { q: '%' }, 0)).receipts).toHaveLength(
      1,
    );
    expect(
      (await service.list('owner', { q: 'MARKET' }, 0)).receipts,
    ).toHaveLength(2);
    const receipt = (await service.list('owner', {}, 0)).receipts[0];
    expect(receipt).not.toHaveProperty('rawText');
  });

  it('uses inclusive Vietnam dates and rejects invalid date filters', async () => {
    await seed();
    expect(
      (await service.list('owner', { from: '2026-10-30', to: '2026-10-30' }, 0))
        .receipts,
    ).toHaveLength(1);
    expect(
      (await service.list('owner', { to: '2026-10-29' }, 0)).receipts,
    ).toHaveLength(0);
    await expect(
      service.list('owner', { from: '2026-02-30' }, 0),
    ).rejects.toThrow('Invalid date');
    await expect(
      service.list('owner', { from: '2026-10-31', to: '2026-10-30' }, 0),
    ).rejects.toThrow('End date');
  });

  it('updates amounts and items atomically and refuses stale or cross-account edits', async () => {
    const receipt = await seed();
    const revision = receipt.revision;
    const result = await service.update('owner', receipt.id, {
      revision,
      receipt: corrected,
    });
    expect(result.receipt.total).toBe(42000);
    expect(result.receipt.lineItems[0].quantity).toBe(2);
    expect(result.receipt.revision).toBe(revision + 1);
    expect(result.categorizationQueued).toBe(true);
    expect(await ds.getRepository(ReceiptItem).count()).toBe(1);
    await expect(
      service.update('owner', receipt.id, {
        revision,
        receipt: { ...corrected, total: 0 },
      }),
    ).rejects.toThrow('another device');
    await expect(
      service.update('other', receipt.id, {
        revision: result.receipt.revision,
        receipt: corrected,
      }),
    ).rejects.toThrow('not found');
    await expect(service.get('other', receipt.id)).rejects.toThrow('not found');
    expect((await service.get('owner', receipt.id)).total).toBe(42000);
  });

  it('rejects invalid money without changing the saved receipt', async () => {
    const receipt = await seed();
    await expect(
      service.update('owner', receipt.id, {
        revision: receipt.revision,
        receipt: { ...corrected, total: -1 },
      }),
    ).rejects.toThrow('Invalid receipt');
    expect((await service.get('owner', receipt.id)).total).toBe(21000);
  });

  it('reports queue failure without discarding a successful edit', async () => {
    const receipt = await seed();
    publish.mockRejectedValue(new Error('queue unavailable'));
    const result = await service.update('owner', receipt.id, {
      revision: receipt.revision,
      receipt: corrected,
    });
    expect(result.categorizationQueued).toBe(false);
    expect(result.receipt.total).toBe(42000);
    expect(result.receipt.lineItems[0].categorizationStatus).toBe('failed');
  });
});
