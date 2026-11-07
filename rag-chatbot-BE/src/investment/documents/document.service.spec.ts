import { ConflictException, NotFoundException } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import { DataSource } from 'typeorm';
import { IngestionJob } from '../../ingestion/entities/ingestion-job.entity';
import { ObjectStorageService } from '../../storage/object-storage.service';
import { VectorStoreService } from '../../vector-store/vector-store.service';
import { InvestmentDocument } from '../entities/investment-document.entity';
import { InvestmentEmbeddingService } from './embedding.service';
import { InvestmentDocumentService, chunkPages } from './document.service';

let mockPages = [{ num: 2, text: 'VCB risk and financial evidence.' }];
jest.mock('pdf-parse', () => ({
  PDFParse: class {
    getInfo() {
      return Promise.resolve({ total: mockPages.length });
    }
    getText() {
      return Promise.resolve({ pages: mockPages });
    }
    destroy() {
      return Promise.resolve();
    }
  },
}));

const jobId = '4e15685b-de2e-41e5-ab98-6091c8512a40';
describe('investment document evidence', () => {
  let db: DataSource;
  let service: InvestmentDocumentService;
  const storage = { readPdf: jest.fn(), createReadUrl: jest.fn() };
  const vectors = {
    deleteInvestmentVectors: jest.fn(),
    addInvestmentVectors: jest.fn(),
    searchInvestmentVectors: jest.fn(),
  };
  const embeddings = { assertConfigured: jest.fn(), embed: jest.fn() };
  beforeEach(async () => {
    jest.clearAllMocks();
    mockPages = [{ num: 2, text: 'VCB risk and financial evidence.' }];
    db = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [InvestmentDocument],
      synchronize: true,
    }).initialize();
    const documents = db.getRepository(InvestmentDocument);
    const source = {
      findOneBy: (filter: { id: string; userId: string }) =>
        Promise.resolve(
          filter.id === jobId && filter.userId === 'alice'
            ? {
                id: jobId,
                userId: 'alice',
                fileType: 'pdf',
                status: 'completed',
                storageKey: 'owned-pdf',
              }
            : null,
        ),
    };
    const dataSource = {
      getRepository: (entity: unknown): unknown =>
        entity === IngestionJob ? source : documents,
    } as unknown as DataSource;
    storage.readPdf.mockResolvedValue(new Uint8Array([1]));
    storage.createReadUrl.mockResolvedValue('https://example.test/signed');
    vectors.deleteInvestmentVectors.mockResolvedValue(undefined);
    vectors.addInvestmentVectors.mockResolvedValue(undefined);
    embeddings.embed.mockImplementation((_user: string, values: string[]) =>
      Promise.resolve(values.map(() => [1, 2])),
    );
    service = new InvestmentDocumentService(
      dataSource,
      storage as unknown as ObjectStorageService,
      vectors as unknown as VectorStoreService,
      embeddings as unknown as InvestmentEmbeddingService,
    );
  });
  afterEach(async () => {
    await db.destroy();
  });

  it('indexes an owned PDF and filters retrieved passages by owner, stock, and publication date', async () => {
    const input = {
      ingestionJobId: jobId,
      title: 'VCB annual report',
      publicationDate: '2025-04-01',
    };
    await expect(service.index('bob', 'VCB', input)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const saved = await service.index('alice', 'vcb', input);
    expect(saved).toMatchObject({
      status: 'ready',
      pageCount: 1,
      chunkCount: 1,
    });
    const call = vectors.addInvestmentVectors.mock.calls[0] as unknown as [
      number[][],
      Document[],
    ];
    expect(call[0]).toEqual([[1, 2]]);
    expect(call[1][0].metadata as Record<string, unknown>).toMatchObject({
      userId: 'alice',
      symbol: 'VCB',
      documentId: saved.id,
      page: 2,
    });
    expect(await service.index('alice', 'VCB', input)).toMatchObject({
      deduplicated: true,
    });
    expect(
      await service.search('alice', 'VCB', {
        query: 'risk',
        asOf: '2025-03-01',
      }),
    ).toMatchObject({ results: [] });
    vectors.searchInvestmentVectors.mockResolvedValue([
      [
        new Document({
          pageContent: 'safe',
          metadata: {
            userId: 'alice',
            symbol: 'VCB',
            documentId: saved.id,
            title: 'VCB annual report',
            publicationDate: '2025-04-01',
            page: 2,
          },
        }),
        0.9,
      ],
      [
        new Document({
          pageContent: 'foreign',
          metadata: {
            userId: 'bob',
            symbol: 'VCB',
            documentId: saved.id,
            page: 2,
          },
        }),
        0.8,
      ],
    ]);
    const result = await service.search('alice', 'VCB', {
      query: 'risk',
      asOf: '2025-05-01',
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      text: 'safe',
      page: 2,
      documentId: saved.id,
    });
    await expect(service.source('bob', 'VCB', saved.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(await service.source('alice', 'VCB', saved.id)).toMatchObject({
      expiresInSeconds: 300,
    });
  });

  it('fails scanned documents without spending, and requires explicit retry', async () => {
    mockPages = [{ num: 1, text: '' }];
    const input = {
      ingestionJobId: jobId,
      title: 'Scanned report',
      publicationDate: '2025-04-01',
    };
    await expect(service.index('alice', 'VCB', input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(embeddings.embed).not.toHaveBeenCalled();
    await expect(service.index('alice', 'VCB', input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    mockPages = [{ num: 1, text: 'Readable text' }];
    expect(
      await service.index('alice', 'VCB', { ...input, retryFailed: true }),
    ).toMatchObject({ status: 'ready' });
  });

  it('preserves page numbers and handles Unicode without splitting surrogate pairs', () => {
    const chunks = chunkPages([{ num: 9, text: '😀'.repeat(901) }]);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].page).toBe(9);
    expect(Array.from(chunks[0].text)).toHaveLength(900);
    expect(chunks[1].text).toBe('😀');
  });
});
