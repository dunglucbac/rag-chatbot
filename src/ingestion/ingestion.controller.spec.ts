import { NotFoundException } from '@nestjs/common';
import { IngestionController } from '@modules/ingestion/ingestion.controller';
import { IngestionService } from '@modules/ingestion/ingestion.service';

describe('IngestionController', () => {
  it('returns a standardized accepted response for uploaded files', async () => {
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
      storagePath: '/tmp/statement.pdf',
      fileType: 'pdf',
      classification: 'unknown',
      checksumSha256: 'abc123',
      correlationId: 'corr-123',
    };

    const ingestionService = {
      createJobFromUpload: jest.fn().mockResolvedValue({ job, event: null }),
      getJob: jest.fn(),
    } as unknown as IngestionService;

    const controller = new IngestionController(ingestionService);

    const result = await controller.uploadFile(
      {
        originalname: 'statement.pdf',
        mimetype: 'application/pdf',
        path: '/tmp/statement.pdf',
        size: 1234,
      } as Express.Multer.File,
      'user-123',
      'corr-123',
    );

    expect(result).toMatchObject({
      status: 'success',
      message: 'File accepted for ingestion',
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
      },
    });
  });

  it('wraps job lookups in the standard api error', async () => {
    const ingestionService = {
      createJobFromUpload: jest.fn(),
      getJob: jest.fn().mockRejectedValue(new NotFoundException()),
    } as unknown as IngestionService;

    const controller = new IngestionController(ingestionService);

    await expect(controller.getJob('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
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

    const result = await controller.getJob('job-123');
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
