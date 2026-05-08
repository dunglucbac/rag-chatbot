import { Injectable } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import { EventEnvelope } from '@modules/common/common.types';
import { EmbedRequestPayload } from '../common/event-payloads.types';
import { VectorStoreService } from './vector-store.service';

@Injectable()
export class VectorStoreConsumer {
  constructor(private readonly vectorStore: VectorStoreService) {}

  async handleEmbedRequest(envelope: EventEnvelope<EmbedRequestPayload>) {
    if (!envelope.payload) return;
    const { chunks, userId } = envelope.payload;

    if (!chunks?.length) return;

    const docs = chunks.map(
      (chunk) =>
        new Document({
          pageContent: chunk.content,
          metadata: { ...chunk.metadata, userId },
        }),
    );

    await this.vectorStore.addDocuments(docs);
  }
}
