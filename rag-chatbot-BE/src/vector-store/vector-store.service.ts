import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { Document } from '@langchain/core/documents';

@Injectable()
export class VectorStoreService implements OnModuleInit {
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

  async addDocuments(docs: Document[]) {
    await this.store.addDocuments(docs);
  }

  async similaritySearch(query: string, k = 4) {
    return this.store.similaritySearch(query, k);
  }

  asRetriever(k = 4) {
    return this.store.asRetriever(k);
  }
}
