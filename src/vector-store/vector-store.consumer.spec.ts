import { Test, TestingModule } from '@nestjs/testing';
import { VectorStoreConsumer } from './vector-store.consumer';
import { VectorStoreService } from './vector-store.service';

describe('VectorStoreConsumer', () => {
  let consumer: VectorStoreConsumer;
  let vectorStoreService: VectorStoreService;

  beforeEach(async () => {
    const mockVectorStore = {
      addDocuments: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VectorStoreConsumer,
        {
          provide: VectorStoreService,
          useValue: mockVectorStore,
        },
      ],
    }).compile();

    consumer = module.get<VectorStoreConsumer>(VectorStoreConsumer);
    vectorStoreService = module.get<VectorStoreService>(VectorStoreService);
  });

  function envelope(payload: Record<string, unknown>) {
    return {
      eventId: 'evt-1',
      eventType: 'doc.chunks.embed.requested',
      correlationId: 'corr-123',
      schemaVersion: 1,
      attempt: 1,
      createdAt: new Date().toISOString(),
      payload,
    };
  }

  it('converts chunk events to Documents and stores them', async () => {
    await consumer.handleEmbedRequest(
      envelope({
        jobId: 'job-doc-1',
        userId: 'user-123',
        chunks: [
          {
            content: 'Chapter 1 text...',
            metadata: { source: 'book.pdf', page: 1 },
          },
          {
            content: 'Chapter 2 text...',
            metadata: { source: 'book.pdf', page: 2 },
          },
        ],
      }),
    );

    expect(vectorStoreService.addDocuments).toHaveBeenCalledTimes(1);
    const docs = (vectorStoreService.addDocuments as jest.Mock).mock
      .calls[0][0];
    expect(docs).toHaveLength(2);
    expect(docs[0].pageContent).toBe('Chapter 1 text...');
    expect(docs[0].metadata.source).toBe('book.pdf');
    expect(docs[0].metadata.userId).toBe('user-123');
  });

  it('skips embedding when chunks array is empty', async () => {
    await consumer.handleEmbedRequest(
      envelope({
        jobId: 'job-doc-1',
        chunks: [],
      }),
    );

    expect(vectorStoreService.addDocuments).not.toHaveBeenCalled();
  });
});
