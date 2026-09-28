import { BadRequestException } from '@nestjs/common';
import { IngestionService } from '@modules/ingestion/ingestion.service';
import { IngestionJobRepository } from '@repositories/ingestion-job.repository';
import { MessageQueueService } from '@modules/message-queue';
import { ObjectStorageService } from '../storage/object-storage.service';

describe('IngestionService', () => {
  const input = {
    storageKey: 'raw/user-123/file-123.pdf',
    originalFilename: 'statement.pdf',
    mimeType: 'application/pdf',
    checksumSha256: 'a'.repeat(64),
  };

  it('creates a job from an existing object and publishes requested work', async () => {
    const createOrGetByChecksum = jest.fn().mockResolvedValue({
      job: { id: 'job-123' },
      created: true,
    });
    const publish = jest.fn().mockResolvedValue({ eventId: 'event-123' });
    const getObjectMetadata = jest.fn().mockResolvedValue({
      contentType: 'application/pdf',
      size: 1234,
    });
    const service = new IngestionService(
      { createOrGetByChecksum } as unknown as IngestionJobRepository,
      { publish } as unknown as MessageQueueService,
      { getObjectMetadata } as unknown as ObjectStorageService,
    );

    const result = await service.createJobFromObject(
      input,
      'user-123',
      'corr-123',
    );

    expect(createOrGetByChecksum).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'file-123',
        userId: 'user-123',
        storageKey: input.storageKey,
        checksumSha256: input.checksumSha256,
      }),
    );
    expect(publish).toHaveBeenCalledWith(
      'doc.pdf.parse.requested',
      expect.objectContaining({
        jobId: 'job-123',
        storageKey: input.storageKey,
        fileSize: 1234,
      }),
      'corr-123',
      1,
      1,
    );
    expect(result.deduplicated).toBe(false);
  });

  it('does not publish a duplicate object ingestion job', async () => {
    const createOrGetByChecksum = jest.fn().mockResolvedValue({
      job: { id: 'job-existing' },
      created: false,
    });
    const publish = jest.fn();
    const service = new IngestionService(
      { createOrGetByChecksum } as unknown as IngestionJobRepository,
      { publish } as unknown as MessageQueueService,
      {
        getObjectMetadata: jest.fn().mockResolvedValue({
          contentType: 'application/pdf',
          size: 1234,
        }),
      } as unknown as ObjectStorageService,
    );

    const result = await service.createJobFromObject(input, 'user-123');

    expect(result).toEqual({ job: { id: 'job-existing' }, deduplicated: true });
    expect(publish).not.toHaveBeenCalled();
  });

  it('rejects an object key outside the authenticated user prefix', async () => {
    const getObjectMetadata = jest.fn();
    const service = new IngestionService(
      {} as IngestionJobRepository,
      {} as MessageQueueService,
      { getObjectMetadata } as unknown as ObjectStorageService,
    );

    await expect(
      service.createJobFromObject(input, 'another-user'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(getObjectMetadata).not.toHaveBeenCalled();
  });

  it('rejects object content whose type differs from the request', async () => {
    const service = new IngestionService(
      {} as IngestionJobRepository,
      {} as MessageQueueService,
      {
        getObjectMetadata: jest.fn().mockResolvedValue({
          contentType: 'image/png',
        }),
      } as unknown as ObjectStorageService,
    );

    await expect(
      service.createJobFromObject(input, 'user-123'),
    ).rejects.toThrow(
      'Object content type does not match the ingestion request',
    );
  });
});
