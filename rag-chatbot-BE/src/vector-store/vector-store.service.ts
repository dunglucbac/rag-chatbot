import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { Document } from '@langchain/core/documents';

@Injectable()
export class VectorStoreService implements OnModuleInit, OnModuleDestroy {
  private store: PGVectorStore;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const embeddings = new OpenAIEmbeddings({
      model: 'text-embedding-3-small',
      apiKey: this.config.get<string>('llm.openaiApiKey'),
    });

    const sslEnabled = this.config.get<string>('db.ssl') === 'true';

    this.store = await PGVectorStore.initialize(embeddings, {
      postgresConnectionOptions: {
        type: 'postgres',
        host: this.config.get<string>('db.host'),
        port: this.config.get<number>('db.port'),
        user: this.config.get<string>('db.user'),
        password: this.config.get<string>('db.pass'),
        database: this.config.get<string>('db.name'),
        ssl: sslEnabled ? { rejectUnauthorized: false } : false,
      },
      tableName: 'document_embeddings',
      columns: {
        idColumnName: 'id',
        vectorColumnName: 'embedding',
        contentColumnName: 'content',
        metadataColumnName: 'metadata',
      },
    });
  }

  async onModuleDestroy() {
    await this.store?.end();
  }

  async addDocuments(docs: Document[]) {
    await this.store.addDocuments(docs);
  }

  async addInvestmentVectors(vectors: number[][], docs: Document[]) {
    await this.store.addVectors(vectors, docs);
  }

  async deleteInvestmentVectors(userId: string, documentId: string) {
    await this.store.delete({ filter: { userId, documentId } });
  }

  async searchInvestmentVectors(
    vector: number[],
    userId: string,
    symbol: string,
    documentIds: string[],
    k = 6,
  ) {
    if (!documentIds.length) return [];
    return this.store.similaritySearchVectorWithScore(vector, k, {
      userId,
      symbol,
      documentId: { in: documentIds },
    });
  }

  async similaritySearch(query: string, k = 4) {
    return this.store.similaritySearch(query, k);
  }

  asRetriever(k = 4) {
    return this.store.asRetriever(k);
  }
}
