import { Injectable, Logger } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import { EventEnvelope } from '@modules/common/common.types';
import { EmbedRequestPayload } from '../common/event-payloads.types';
import { VectorStoreService } from './vector-store.service';

@Injectable()
export class VectorStoreConsumer {
  private readonly logger = new Logger(VectorStoreConsumer.name);

  constructor(private readonly vectorStore: VectorStoreService) {}

  async handleEmbedRequest(envelope: EventEnvelope<EmbedRequestPayload>) {
    if (!envelope.payload) return;
    const { chunks, userId } = envelope.payload;
    this.logger.log(
      `handleEmbedRequest [correlationId=${envelope.correlationId} jobId=${envelope.payload.jobId}] chunks=${chunks.length}`,
    );

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
