import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Document } from '@langchain/core/documents';
import { VectorStoreService } from '../vector-store/vector-store.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { IngestionJob } from '../ingestion/entities/ingestion-job.entity';
import { InvestmentDocumentService } from './documents/document.service';
import { InvestmentEmbeddingService } from './documents/embedding.service';
import { AddInvestmentJournal1794000000000 } from '../database/migrations/1794000000000-AddInvestmentJournal';
import { AddInvestmentCorrections1794100000000 } from '../database/migrations/1794100000000-AddInvestmentCorrections';
import { AddFinhayConnections1794200000000 } from '../database/migrations/1794200000000-AddFinhayConnections';
import { AddInvestmentBudget1794300000000 } from '../database/migrations/1794300000000-AddInvestmentBudget';
import { AddInvestmentDocuments1794400000000 } from '../database/migrations/1794400000000-AddInvestmentDocuments';
import { InvestmentDocument } from './entities/investment-document.entity';
import { InvestmentBudget } from './entities/investment-budget.entity';
import { InvestmentReservation } from './entities/investment-reservation.entity';
import { BudgetService } from './budget/budget.service';
import { FinhayConnection } from './entities/finhay-connection.entity';
import { InvestmentEvent } from './entities/investment-event.entity';
import { InvestmentStock } from './entities/investment-stock.entity';
import { InvestmentService } from './investment.service';

const url = process.env.INVESTMENT_TEST_DATABASE_URL;
if (url && new URL(url).pathname !== '/investment_journal_test') {
  throw new Error(
    'PostgreSQL investment tests require a disposable investment_journal_test database',
  );
}
const postgres = url ? describe : describe.skip;

function samplePdf(): Buffer {
  const content = 'BT /F1 16 Tf 72 720 Td (VCB credit risk report) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

postgres('investment PostgreSQL migration and concurrency', () => {
  let db: DataSource;
  let service: InvestmentService;

  beforeAll(async () => {
    db = await new DataSource({
      type: 'postgres',
      url,
      entities: [
        InvestmentStock,
        InvestmentEvent,
        FinhayConnection,
        InvestmentBudget,
        InvestmentReservation,
        InvestmentDocument,
      ],
      migrations: [
        AddInvestmentJournal1794000000000,
        AddInvestmentCorrections1794100000000,
        AddFinhayConnections1794200000000,
        AddInvestmentBudget1794300000000,
        AddInvestmentDocuments1794400000000,
      ],
      synchronize: false,
    }).initialize();
    await db.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await db.runMigrations();
    service = new InvestmentService(db);
  });
  afterAll(async () => {
    if (db?.isInitialized) {
      await db.undoLastMigration();
      await db.undoLastMigration();
      await db.undoLastMigration();
      await db.undoLastMigration();
      await db.undoLastMigration();
      await db.destroy();
    }
  });

  it('preserves one event when identical requests race and isolates other users', async () => {
    const input = {
      requestId: '6e15685b-de2e-41e5-ab98-6091c8512a40',
      type: 'buy',
      occurredOn: '2025-11-06',
      shares: 500,
      priceVnd: '54000',
    };
    const result = await Promise.all(
      Array.from({ length: 5 }, () => service.record('alice', 'VCB', input)),
    );
    expect(result.filter((item) => !item.deduplicated)).toHaveLength(1);
    expect((await service.get('alice', 'VCB')).events).toHaveLength(1);
    expect(await service.list('bob')).toEqual([]);
    await service.record('bob', 'VCB', input);
    expect((await service.get('bob', 'VCB')).events).toHaveLength(1);
  });

  it('accepts only one competing correction to an event', async () => {
    const input = {
      requestId: '7e15685b-de2e-41e5-ab98-6091c8512a40',
      type: 'buy',
      occurredOn: '2025-11-06',
      shares: 100,
      priceVnd: '12',
    };
    const original = await service.record('carol', 'MWG', input);
    const edits = [
      {
        ...input,
        requestId: '8e15685b-de2e-41e5-ab98-6091c8512a40',
        supersedesId: original.event.id,
        shares: 101,
      },
      {
        ...input,
        requestId: '9e15685b-de2e-41e5-ab98-6091c8512a40',
        supersedesId: original.event.id,
        shares: 102,
      },
    ];
    const outcomes = await Promise.allSettled(
      edits.map((edit) => service.record('carol', 'MWG', edit)),
    );
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === 'rejected'),
    ).toHaveLength(1);
    const result = await service.get('carol', 'MWG');
    expect(result.events).toHaveLength(2);
    expect(['101', '102']).toContain(result.position.shares);
  });

  it('enforces the monthly budget across concurrent reservations', async () => {
    const budget = new BudgetService(db);
    const now = new Date('2026-11-06T00:00:00Z');
    const outcomes = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        budget.reserve(
          'dana',
          `ae15685b-de2e-41e5-ab98-6091c8512a4${i}`,
          '3000000',
          now,
        ),
      ),
    );
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(3);
    expect(
      outcomes.filter((outcome) => outcome.status === 'rejected'),
    ).toHaveLength(2);
    expect(await budget.status('dana', now)).toMatchObject({
      reservedMicros: '9000000',
      remainingMicros: '1000000',
    });
  });

  it('filters vector evidence by owner, symbol, and ready document IDs', async () => {
    await db.query('CREATE EXTENSION IF NOT EXISTS vector');
    const connection = new URL(url!);
    const vectors = new VectorStoreService(
      new ConfigService({
        db: {
          host: connection.hostname,
          port: Number(connection.port),
          user: connection.username,
          pass: connection.password,
          name: connection.pathname.slice(1),
          ssl: 'false',
        },
        llm: { openaiApiKey: 'test-only' },
      }),
    );
    await vectors.onModuleInit();
    try {
      const embedding = Array.from({ length: 1536 }, () => 0.1);
      await vectors.addInvestmentVectors(
        [embedding, embedding, embedding],
        [
          new Document({
            pageContent: 'owned',
            metadata: { userId: 'alice', symbol: 'VCB', documentId: 'allowed' },
          }),
          new Document({
            pageContent: 'other user',
            metadata: { userId: 'bob', symbol: 'VCB', documentId: 'allowed' },
          }),
          new Document({
            pageContent: 'not ready',
            metadata: {
              userId: 'alice',
              symbol: 'VCB',
              documentId: 'not-allowed',
            },
          }),
        ],
      );
      const matches = await vectors.searchInvestmentVectors(
        embedding,
        'alice',
        'VCB',
        ['allowed'],
      );
      expect(matches.map(([document]) => document.pageContent)).toEqual([
        'owned',
      ]);
    } finally {
      await vectors.onModuleDestroy();
      await db.query('DROP TABLE IF EXISTS document_embeddings');
    }
  });

  it('indexes and retrieves a real PDF page while accounting for embeddings', async () => {
    await db.query('CREATE EXTENSION IF NOT EXISTS vector');
    const connection = new URL(url!);
    const config = new ConfigService({ db: { host: connection.hostname, port: Number(connection.port), user: connection.username, pass: connection.password, name: connection.pathname.slice(1), ssl: 'false' }, llm: { openaiApiKey: 'test-only' }, investment: { embeddingRate: '20000' } });
    const vectors = new VectorStoreService(config);
    await vectors.onModuleInit();
    const pdf = samplePdf();
    const jobId = '7e15685b-de2e-41e5-ab98-6091c8512a40';
    const documentRepository = db.getRepository(InvestmentDocument);
    const source = { findOneBy: (filter: { id: string; userId: string }) => Promise.resolve(filter.id === jobId && filter.userId === 'erin' ? { id: jobId, userId: 'erin', fileType: 'pdf', status: 'completed', storageKey: 'owned-pdf' } : null) };
    const scoped = { getRepository: (entity: unknown): unknown => entity === IngestionJob ? source : documentRepository } as unknown as DataSource;
    const storage = { readPdf: () => Promise.resolve(pdf), createReadUrl: () => Promise.resolve('https://example.test/source') } as unknown as ObjectStorageService;
    const budget = new BudgetService(db);
    const embeddings = new InvestmentEmbeddingService(config, budget);
    const documents = new InvestmentDocumentService(scoped, storage, vectors, embeddings);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_input: string | URL | Request, init?: RequestInit) => {
      await Promise.resolve();
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as { input: string[] };
      return new Response(JSON.stringify({ data: body.input.map((_, index) => ({ index, embedding: Array.from({ length: 1536 }, () => 0.1) })), usage: { total_tokens: 25 } }), { status: 200 });
    });
    try {
      const saved = await documents.index('erin', 'VCB', { ingestionJobId: jobId, title: 'VCB annual report', publicationDate: '2025-01-01' });
      expect(saved).toMatchObject({ status: 'ready', pageCount: 1 });
      const result = await documents.search('erin', 'VCB', { query: 'credit risk' });
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({ documentId: saved.id, page: 1, text: expect.stringContaining('VCB credit risk report') });
      expect(await budget.status('erin')).toMatchObject({ spentMicros: '2', reservedMicros: '0' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(await documents.search('other-user', 'VCB', { query: 'credit risk' })).toMatchObject({ results: [] });
    } finally {
      fetchMock.mockRestore();
      await vectors.onModuleDestroy();
      await db.query('DROP TABLE IF EXISTS document_embeddings');
    }
  });
});
