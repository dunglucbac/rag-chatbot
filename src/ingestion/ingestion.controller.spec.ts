import { NotFoundException } from '@nestjs/common';
import { IngestionController } from '@modules/ingestion/ingestion.controller';
import { IngestionService } from '@modules/ingestion/ingestion.service';

describe('IngestionController', () => {
  it('returns a standardized accepted response for an object ingestion request', async () => {
    const job = {
      id: 'job-123',
      fileId: 'file-123',
      userId: 'user-123',
      status: 'pending',
      sourceType: 'pdf',
      originalFilename: 'statement.pdf',
      mimeType: 'application/pdf',
      errorMessage: null,
      chunkCount: 0,
      createdAt: new Date('2026-04-30T00:00:00.000Z'),
      updatedAt: new Date('2026-04-30T00:00:00.000Z'),
      completedAt: null,
      metadata: null,
      storageKey: 'raw/statement.pdf',
      fileType: 'pdf',
      classification: 'unknown',
      checksumSha256: 'abc123',
      correlationId: 'corr-123',
    };

    const ingestionService = {
      createJobFromObject: jest
        .fn()
        .mockResolvedValue({ job, event: null, deduplicated: false }),
      getJob: jest.fn(),
    } as unknown as IngestionService;

    const controller = new IngestionController(ingestionService);

    const result = await controller.createJob(
      {
        storageKey: 'raw/user-123/statement.pdf',
        originalFilename: 'statement.pdf',
        mimeType: 'application/pdf',
      },
      { id: 'user-123', email: 'user@example.com' },
      'corr-123',
    );

    expect(result).toMatchObject({
      status: 'success',
      message: 'Object accepted for ingestion',
      data: {
        job: {
          id: 'job-123',
          fileId: 'file-123',
          userId: 'user-123',
          status: 'pending',
          originalFilename: 'statement.pdf',
          mimeType: 'application/pdf',
        },
        accepted: true,
        deduplicated: false,
      },
    });
  });

  it('wraps job lookups in the standard api error', async () => {
    const ingestionService = {
      createJobFromObject: jest.fn(),
      getJob: jest.fn().mockRejectedValue(new NotFoundException()),
    } as unknown as IngestionService;

    const controller = new IngestionController(ingestionService);

    await expect(
      controller.getJob('missing', {
        id: 'user-123',
        email: 'user@example.com',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('wraps job lookups in the standard api response', async () => {
    const job = {
      id: 'job-123',
      fileId: 'file-123',
      userId: 'user-123',
      status: 'pending',
      originalFilename: 'statement.pdf',
      mimeType: 'application/pdf',
    } as const;
    const ingestionService = {
      getJob: jest.fn().mockResolvedValue(job),
    } as unknown as IngestionService;

    const controller = new IngestionController(ingestionService);

    const result = await controller.getJob('job-123', {
      id: 'user-123',
      email: 'user@example.com',
    });
    expect(result).toMatchObject({
      status: 'success',
      message: 'Ingestion job fetched',
      data: {
        job: {
          id: 'job-123',
          fileId: 'file-123',
          userId: 'user-123',
        },
      },
    });
  });
});
