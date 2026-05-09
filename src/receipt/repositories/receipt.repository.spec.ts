import { DataSource } from 'typeorm';
import { Receipt } from '../entities/receipt.entity';
import { ReceiptItem } from '../entities/receipt-item.entity';
import { ReceiptRepository } from './receipt.repository';

describe('ReceiptRepository', () => {
  let dataSource: DataSource;
  let repository: ReceiptRepository;

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
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.getRepository(ReceiptItem).clear();
    await dataSource.getRepository(Receipt).clear();
  });

  it('can save a receipt with required fields', async () => {
    const receipt = await repository.create({
      userId: 'user-123',
      merchant: 'Starbucks',
      purchasedAt: new Date('2026-05-05T10:30:00Z'),
      total: 12.5,
      tax: 1.15,
      currency: 'USD',
      source: 'telegram',
      checksumSha256: 'abc123',
    });

    expect(receipt.id).toBeDefined();
    expect(receipt.merchant).toBe('Starbucks');
    expect(receipt.total).toBe(12.5);

    const found = await repository.findById(receipt.id);
    expect(found).toBeDefined();
    expect(found?.merchant).toBe('Starbucks');
  });

  it('can save receipt items linked to a receipt', async () => {
    const receipt = await repository.create({
      userId: 'user-123',
      merchant: 'Starbucks',
      purchasedAt: new Date('2026-05-05T10:30:00Z'),
      total: 12.5,
      currency: 'USD',
      source: 'telegram',
      checksumSha256: 'abc123',
    });

    const itemRepository = dataSource.getRepository(ReceiptItem);
    const item = await itemRepository.save({
      receiptId: receipt.id,
      name: 'Latte',
      quantity: 1,
      unitPrice: 4.5,
      totalPrice: 4.5,
    });

    expect(item.id).toBeDefined();
    expect(item.receiptId).toBe(receipt.id);
    expect(item.name).toBe('Latte');

    const foundReceipt = await dataSource
      .getRepository(Receipt)
      .findOne({ where: { id: receipt.id }, relations: ['items'] });

    expect(foundReceipt?.items).toHaveLength(1);
    expect(foundReceipt?.items[0].name).toBe('Latte');
  });

  it('rejects duplicate receipts with same userId, merchant, purchasedAt, total, and checksum', async () => {
    const receiptData = {
      userId: 'user-456',
      merchant: 'Target',
      purchasedAt: new Date('2026-05-06T14:00:00Z'),
      total: 50.0,
      currency: 'USD',
      source: 'telegram',
      checksumSha256: 'xyz789',
    };

    await repository.create(receiptData);

    await expect(repository.create(receiptData)).rejects.toThrow();
  });
});
