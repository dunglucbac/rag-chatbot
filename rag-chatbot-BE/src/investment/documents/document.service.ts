import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import { PDFParse } from 'pdf-parse';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { z } from 'zod';
import { IngestionJob } from '../../ingestion/entities/ingestion-job.entity';
import { IngestionJobStatus } from '../../ingestion/ingestion.types';
import { ObjectStorageService } from '../../storage/object-storage.service';
import { VectorStoreService } from '../../vector-store/vector-store.service';
import { InvestmentDocument } from '../entities/investment-document.entity';
import { InvestmentEmbeddingService } from './embedding.service';

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });
const documentInput = z
  .object({
    ingestionJobId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    publicationDate: date,
    retryFailed: z.boolean().optional(),
  })
  .strict();
const searchInput = z
  .object({ query: z.string().trim().min(1).max(2000), asOf: date.optional() })
  .strict();
const symbolOf = (input: string) => {
  const symbol = input.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,10}$/.test(symbol))
    throw new BadRequestException('Invalid stock symbol');
  return symbol;
};
function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function chunkPages(pages: Array<{ num: number; text: string }>) {
  const chunks: Array<{ page: number; text: string }> = [];
  for (const page of pages) {
    const chars = Array.from(page.text.replace(/\0/g, '').trim());
    for (let offset = 0; offset < chars.length; offset += 900) {
      const text = chars
        .slice(offset, offset + 900)
        .join('')
        .trim();
      if (text) chunks.push({ page: page.num, text });
    }
  }
  return chunks;
}

@Injectable()
export class InvestmentDocumentService {
  constructor(
    private readonly db: DataSource,
    private readonly storage: ObjectStorageService,
    private readonly vectors: VectorStoreService,
    private readonly embeddings: InvestmentEmbeddingService,
  ) {}

  async list(userId: string, value: string) {
    const symbol = symbolOf(value);
    const rows = await this.db.getRepository(InvestmentDocument).find({
      where: { userId, symbol },
      order: { publicationDate: 'DESC', createdAt: 'DESC' },
    });
    return rows.map(
      ({
        id,
        title,
        publicationDate,
        status,
        pageCount,
        chunkCount,
        createdAt,
      }) => ({
        id,
        title,
        publicationDate,
        status,
        pageCount,
        chunkCount,
        createdAt,
      }),
    );
  }

  async index(userId: string, value: string, input: unknown) {
    const symbol = symbolOf(value);
    const parsed = documentInput.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException('Invalid document details');
    const { ingestionJobId, title, publicationDate, retryFailed } = parsed.data;
    const job = await this.db
      .getRepository(IngestionJob)
      .findOneBy({ id: ingestionJobId, userId });
    if (!job) throw new NotFoundException('Upload not found');
    if (job.fileType !== 'pdf' || job.status !== IngestionJobStatus.COMPLETED)
      throw new ConflictException('Upload must be a completed PDF');
    this.embeddings.assertConfigured();
    const repo = this.db.getRepository(InvestmentDocument);
    let document = await repo.findOneBy({ userId, symbol, ingestionJobId });
    if (document) {
      if (
        document.title !== title ||
        document.publicationDate !== publicationDate
      )
        throw new ConflictException(
          'Document was already added with different details',
        );
      if (document.status === 'ready')
        return { id: document.id, status: document.status, deduplicated: true };
      if (document.status !== 'failed' || !retryFailed)
        throw new ConflictException(
          'Document is indexing or requires an explicit retry',
        );
      const changed = await repo.update(
        { id: document.id, userId, status: 'failed' },
        { status: 'indexing' },
      );
      if (changed.affected !== 1)
        throw new ConflictException('Document is already indexing');
      document.status = 'indexing';
    } else {
      try {
        document = await repo.save(
          repo.create({
            userId,
            symbol,
            ingestionJobId,
            title,
            publicationDate,
            status: 'indexing',
            pageCount: 0,
            chunkCount: 0,
          }),
        );
      } catch (error: unknown) {
        const existing = await repo.findOneBy({
          userId,
          symbol,
          ingestionJobId,
        });
        if (existing)
          throw new ConflictException('Document is already being added');
        throw error;
      }
    }
    try {
      const bytes = await this.storage.readPdf(job.storageKey);
      const parser = new PDFParse({ data: bytes });
      let pages: Array<{ num: number; text: string }>;
      try {
        const info = await parser.getInfo();
        if (info.total > 300)
          throw new ConflictException('PDF exceeds the 300-page limit');
        pages = (await parser.getText()).pages;
      } finally {
        await parser.destroy();
      }
      if (pages.reduce((total, page) => total + page.text.length, 0) > 150000)
        throw new ConflictException(
          'PDF text exceeds the indexing limit; split the report into smaller files',
        );
      const chunks = chunkPages(pages);
      if (!chunks.length)
        throw new ConflictException(
          'No searchable text found; scanned PDF page-level OCR is not available',
        );
      const embeddings = await this.embeddings.embed(
        userId,
        chunks.map((chunk) => chunk.text),
      );
      await this.vectors.deleteInvestmentVectors(userId, document.id);
      const docs = chunks.map(
        (chunk) =>
          new Document({
            pageContent: chunk.text,
            metadata: {
              userId,
              symbol,
              documentId: document.id,
              title,
              publicationDate,
              page: chunk.page,
            },
          }),
      );
      await this.vectors.addInvestmentVectors(embeddings, docs);
      await repo.update(
        { id: document.id, userId, status: 'indexing' },
        { status: 'ready', pageCount: pages.length, chunkCount: chunks.length },
      );
      return {
        id: document.id,
        status: 'ready',
        pageCount: pages.length,
        chunkCount: chunks.length,
        deduplicated: false,
      };
    } catch (error: unknown) {
      await repo.update(
        { id: document.id, userId, status: 'indexing' },
        { status: 'failed' },
      );
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof ServiceUnavailableException
      )
        throw error;
      throw new ServiceUnavailableException('Could not index the document');
    }
  }

  async search(userId: string, value: string, input: unknown) {
    const symbol = symbolOf(value);
    const parsed = searchInput.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException('Invalid document search');
    const asOf = parsed.data.asOf ?? today();
    if (asOf > today())
      throw new BadRequestException('Search date cannot be in the future');
    const docs = await this.db.getRepository(InvestmentDocument).find({
      where: {
        userId,
        symbol,
        status: 'ready',
        publicationDate: LessThanOrEqual(asOf),
      },
    });
    if (!docs.length) return { results: [], asOf };
    const [vector] = await this.embeddings.embed(userId, [parsed.data.query]);
    const ids = docs.map((doc) => doc.id);
    const matches = await this.vectors.searchInvestmentVectors(
      vector,
      userId,
      symbol,
      ids,
    );
    return {
      asOf,
      results: matches
        .filter(
          ([doc]) =>
            doc.metadata.userId === userId &&
            doc.metadata.symbol === symbol &&
            ids.includes(String(doc.metadata.documentId)) &&
            Number.isInteger(doc.metadata.page),
        )
        .map(([doc, score]) => ({
          documentId: doc.metadata.documentId as string,
          title: doc.metadata.title as string,
          publicationDate: doc.metadata.publicationDate as string,
          page: doc.metadata.page as number,
          text: doc.pageContent,
          score,
        })),
    };
  }

  async source(userId: string, value: string, id: string) {
    const symbol = symbolOf(value);
    if (!z.string().uuid().safeParse(id).success)
      throw new BadRequestException('Invalid document ID');
    const document = await this.db
      .getRepository(InvestmentDocument)
      .findOneBy({ id, userId, symbol, status: 'ready' });
    if (!document) throw new NotFoundException('Document not found');
    const job = await this.db
      .getRepository(IngestionJob)
      .findOneBy({ id: document.ingestionJobId, userId });
    if (!job) throw new NotFoundException('Upload not found');
    return {
      url: await this.storage.createReadUrl(job.storageKey),
      expiresInSeconds: 300,
    };
  }
}
