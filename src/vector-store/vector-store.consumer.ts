import { Injectable } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import { VectorStoreService } from './vector-store.service';

@Injectable()
export class VectorStoreConsumer {
  constructor(private readonly vectorStore: VectorStoreService) {}

  async handleEmbedRequest(event: any) {
    const { chunks, userId } = event;

    if (!chunks?.length) return;

    const docs = chunks.map(
      (chunk: any) =>
        new Document({
          pageContent: chunk.content,
          metadata: { ...chunk.metadata, userId },
        }),
    );

    await this.vectorStore.addDocuments(docs);
  }
}
