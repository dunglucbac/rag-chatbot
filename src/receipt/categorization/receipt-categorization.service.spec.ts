import { DataSource } from 'typeorm';
import { Receipt } from '../entities/receipt.entity';
import {
  ReceiptCategorizationStatus,
  ReceiptItem,
} from '../entities/receipt-item.entity';
import { ReceiptCategorizationService } from './receipt-categorization.service';

describe('ReceiptCategorizationService', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [Receipt, ReceiptItem],
      synchronize: true,
    });
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('persists a confident taxonomy classification for only the event user', async () => {
    const item = await savePendingItem('user-1', 'Milk');
    await savePendingItem('user-2', 'Private purchase');
    const invoke = jest.fn().mockResolvedValue({
      category: 'food',
      subcategory: 'groceries',
      confidence: 0.82,
    });
    const service = new ReceiptCategorizationService(
      dataSource,
      fakeLlm(invoke),
    );

    await service.categorizeReceipt(item.receiptId, 'user-1');

    const saved = await dataSource.getRepository(ReceiptItem).findOneByOrFail({
      id: item.id,
    });
    expect(saved).toMatchObject({
      category: 'food',
      subcategory: 'groceries',
      categorizationStatus: ReceiptCategorizationStatus.COMPLETED,
      categoryConfidence: 0.82,
      taxonomyVersion: 'v1',
      classificationMetadata: {
        suggestedCategory: 'food',
        suggestedSubcategory: 'groceries',
      },
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('stores a low-confidence result as unknown while preserving its suggestion', async () => {
    const item = await savePendingItem('user-1', 'Milk');
    const service = new ReceiptCategorizationService(
      dataSource,
      fakeLlm(
        jest.fn().mockResolvedValue({
          category: 'food',
          subcategory: 'groceries',
          confidence: 0.69,
        }),
      ),
    );

    await service.categorizeReceipt(item.receiptId, 'user-1');

    const saved = await dataSource.getRepository(ReceiptItem).findOneByOrFail({
      id: item.id,
    });
    expect(saved).toMatchObject({
      category: 'unknown',
      subcategory: null,
      categorizationStatus: ReceiptCategorizationStatus.COMPLETED,
      classificationMetadata: {
        suggestedCategory: 'food',
        suggestedSubcategory: 'groceries',
      },
    });
  });

  it('marks an item failed and rethrows when classification cannot complete', async () => {
    const item = await savePendingItem('user-1', 'Milk');
    const service = new ReceiptCategorizationService(
      dataSource,
      fakeLlm(jest.fn().mockRejectedValue(new Error('model unavailable'))),
    );

    await expect(
      service.categorizeReceipt(item.receiptId, 'user-1'),
    ).rejects.toThrow('model unavailable');

    await expect(
      dataSource.getRepository(ReceiptItem).findOneByOrFail({ id: item.id }),
    ).resolves.toMatchObject({
      categorizationStatus: ReceiptCategorizationStatus.FAILED,
    });
  });

  function fakeLlm(invoke: jest.Mock) {
    return {
      getModel: () => ({
        withStructuredOutput: jest.fn(() => ({ invoke })),
      }),
    };
  }

  async function savePendingItem(
    userId: string,
    name: string,
  ): Promise<ReceiptItem> {
    const receiptRepository = dataSource.getRepository(Receipt);
    const receipt = await receiptRepository.save(
      receiptRepository.create({
        userId,
        ingestionJobId: null,
        merchant: 'Local Market',
        purchasedAt: new Date('2026-09-20T03:00:00.000Z'),
        total: 50_000,
        tax: null,
        currency: 'VND',
        source: 'test',
        rawText: null,
        checksumSha256: `${userId}-${name}`,
        items: [
          {
            name,
            quantity: 1,
            unitPrice: 50_000,
            totalPrice: 50_000,
            category: null,
            subcategory: null,
            categorizationStatus: ReceiptCategorizationStatus.PENDING,
            categoryConfidence: null,
            taxonomyVersion: null,
            classificationMetadata: null,
          },
        ],
      }),
    );
    return receipt.items[0];
  }
});
