import { Injectable } from '@nestjs/common';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { VectorStoreService } from '../vector-store/vector-store.service';
import * as fs from 'fs';

@Injectable()
export class IngestionService {
  constructor(private readonly vectorStore: VectorStoreService) {}

  async ingestPdf(filePath: string): Promise<number> {
    const loader = new PDFLoader(filePath);
    const docs = await loader.load();

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const chunks = await splitter.splitDocuments(docs);

    await this.vectorStore.addDocuments(chunks);

    fs.unlinkSync(filePath);
    return chunks.length;
  }
}
