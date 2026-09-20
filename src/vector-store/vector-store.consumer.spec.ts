import { Test, TestingModule } from '@nestjs/testing';
import { VectorStoreConsumer } from './vector-store.consumer';
import { VectorStoreService } from './vector-store.service';
import { EventEnvelope } from '@modules/common/common.types';
import { EmbedRequestPayload } from '../common/event-payloads.types';

type Documents = Parameters<VectorStoreService['addDocuments']>[0];

describe('VectorStoreConsumer', () => {
  let consumer: VectorStoreConsumer;
  let addDocuments: jest.Mock<Promise<void>, [Documents]>;

  beforeEach(async () => {
    addDocuments = jest.fn<Promise<void>, [Documents]>();
    const mockVectorStore = {
      addDocuments,
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
  });

  function envelope(
    payload: EmbedRequestPayload,
  ): EventEnvelope<EmbedRequestPayload> {
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

    expect(addDocuments).toHaveBeenCalledTimes(1);
    const call = addDocuments.mock.calls[0];
    if (!call) throw new Error('Documents were not added');
    const [documents] = call;
    expect(documents).toHaveLength(2);
    expect(documents[0].pageContent).toBe('Chapter 1 text...');
    expect(documents[0].metadata.source).toBe('book.pdf');
    expect(documents[0].metadata.userId).toBe('user-123');
    expect(documents[1].pageContent).toBe('Chapter 2 text...');
  });

  it('skips embedding when chunks array is empty', async () => {
    await consumer.handleEmbedRequest(
      envelope({
        jobId: 'job-doc-1',
        userId: 'user-123',
        chunks: [],
      }),
    );

    expect(addDocuments).not.toHaveBeenCalled();
  });
});
