import { DataSource } from 'typeorm';
import { Receipt } from './entities/receipt.entity';
import { ReceiptItem } from './entities/receipt-item.entity';
import { ReceiptService } from './receipt.service';
import { IngestionJob } from '../ingestion/entities/ingestion-job.entity';

type MetadataBuildableDataSource = DataSource & {
  buildMetadatas(): Promise<void>;
};

describe('ReceiptService Integration', () => {
  let dataSource: DataSource;
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

    // SQLite cannot initialize IngestionJob because it has PostgreSQL enum
    // columns. Register the production metadata separately so this test still
    // validates the property-to-column mapping used by the real application.
    const metadataSource = new DataSource({
      type: 'postgres',
      entities: [IngestionJob],
    }) as unknown as MetadataBuildableDataSource;
    await metadataSource.buildMetadatas();
    const metadata = metadataSource.getMetadata(IngestionJob);
    dataSource.entityMetadatas.push(metadata);
    dataSource.entityMetadatasMap.set(IngestionJob, metadata);

    await dataSource.query(
      `CREATE TABLE ingestion_jobs (id varchar PRIMARY KEY, status varchar, classification varchar, extracted_text text, completed_at datetime, updated_at datetime)`,
    );
    service = new ReceiptService(dataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.getRepository(ReceiptItem).clear();
    await dataSource.getRepository(Receipt).clear();
    await dataSource.query(`DELETE FROM ingestion_jobs`);
  });

  async function createIngestionJob(id: string): Promise<void> {
    await dataSource.query(
      `INSERT INTO ingestion_jobs (id, status, classification) VALUES (?, ?, ?)`,
      [id, 'processing', 'unknown'],
    );
  }

  it('saves a receipt with line items from a parsed event', async () => {
    await createIngestionJob('job-123');
    const event = {
      jobId: 'job-123',
      userId: 'user-456',
      rawText: 'Starbucks\nLatte $4.50\nTotal $12.50',
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

    const result = await service.saveFromEvent(event);

    expect(result.id).toBeDefined();
    expect(result.merchant).toBe('Starbucks');
    expect(result.total).toBe(12.5);
    expect(result.source).toBe('ingestion');
    expect(result.ingestionJobId).toBe('job-123');

    const found = await dataSource.getRepository(Receipt).findOne({
      where: { id: result.id },
      relations: ['items'],
    });
    expect(found?.items).toHaveLength(1);
    expect(found?.items[0].name).toBe('Latte');
    expect(found?.items[0].totalPrice).toBe(4.5);

    const jobs = await dataSource.query<
      Array<{
        status: string;
        classification: string;
        extracted_text: string | null;
      }>
    >(
      `SELECT status, classification, extracted_text FROM ingestion_jobs WHERE id = ?`,
      ['job-123'],
    );
    const [job] = jobs;
    expect(job).toEqual({
      status: 'completed',
      classification: 'receipt',
      extracted_text: 'Starbucks\nLatte $4.50\nTotal $12.50',
    });
  });

  it('rolls back receipt persistence when the ingestion job is missing', async () => {
    await expect(
      service.saveFromEvent({
        jobId: 'missing-job',
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
      }),
    ).rejects.toThrow('Ingestion job not found: missing-job');

    expect(await dataSource.getRepository(Receipt).count()).toBe(0);
  });

  it('detects duplicate receipts via composite unique constraint', async () => {
    await createIngestionJob('job-dup');
    await createIngestionJob('job-dup-2');
    const event = {
      jobId: 'job-dup',
      userId: 'user-456',
      rawText: 'Same receipt content',
      receipt: {
        merchant: 'Target',
        purchasedAt: '2026-05-06T14:00:00Z',
        total: 50.0,
        currency: 'USD',
        lineItems: [],
        confidence: 1,
        discrepancy: null,
      },
    };

    // First save succeeds
    await service.saveFromEvent(event);

    // Second save with same content produces same checksum, should fail
    await expect(
      service.saveFromEvent({ ...event, jobId: 'job-dup-2' }),
    ).rejects.toThrow();
  });

  it('validates checksum consistency across saves', async () => {
    await createIngestionJob('job-1');
    await createIngestionJob('job-2');
    const event1 = {
      jobId: 'job-1',
      userId: 'user-456',
      rawText: 'Receipt A content',
      receipt: {
        merchant: 'Walmart',
        purchasedAt: '2026-05-06T14:00:00Z',
        total: 50.0,
        currency: 'USD',
        lineItems: [],
        confidence: 1,
        discrepancy: null,
      },
    };

    const event2 = {
      ...event1,
      jobId: 'job-2',
      rawText: 'Receipt B content - different file',
    };

    const saved1 = await service.saveFromEvent(event1);
    const saved2 = await service.saveFromEvent(event2);

    expect(saved1.checksumSha256).not.toBe(saved2.checksumSha256);
  });

  it('same content produces identical checksum', async () => {
    await createIngestionJob('job-same');
    const event = {
      jobId: 'job-same',
      userId: 'user-456',
      rawText: 'Identical receipt content',
      receipt: {
        merchant: 'Costco',
        purchasedAt: '2026-05-06T14:00:00Z',
        total: 100.0,
        currency: 'USD',
        lineItems: [],
        confidence: 1,
        discrepancy: null,
      },
    };

    const saved1 = await service.saveFromEvent(event);

    // Clear the first save so we can save again
    await dataSource.getRepository(Receipt).clear();

    const saved2 = await service.saveFromEvent(event);

    expect(saved1.checksumSha256).toBe(saved2.checksumSha256);
  });
});
