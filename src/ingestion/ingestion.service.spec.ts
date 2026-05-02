import * as crypto from 'crypto';
import * as fs from 'fs';
import { BadRequestException } from '@nestjs/common';
import { DispatchEnvelope } from '@modules/common/common.types';
import { IngestionJobRepository } from '@modules/repositories/ingestion-job.repository';
import { MessageQueueService } from '@modules/message-queue/publisher/publisher.service';
import { IngestionJob } from './entities/ingestion-job.entity';
import { IngestionService } from './ingestion.service';
import { IngestionDispatchPayload } from './ingestion.types';

jest.mock('fs', () => ({
  ...jest.requireActual<typeof import('fs')>('fs'),
  readFileSync: jest.fn(),
}));

const readFileSync = jest.mocked(fs.readFileSync);

const createJob = (id: string): IngestionJob => ({ id }) as IngestionJob;

const createEvent = (
  eventType: string,
): DispatchEnvelope<IngestionDispatchPayload> =>
  ({
    schemaVersion: 1,
    eventId: 'event-1',
    eventType,
    correlationId: 'corr-1',
    attempt: 1,
    createdAt: '2026-05-02T00:00:00.000Z',
    payload: {
      jobId: 'job-1',
      fileId: 'file',
      userId: 'user-1',
      fileType: 'pdf',
      classification: 'unknown',
      originalFilename: 'doc.pdf',
      storagePath: '/tmp/file.pdf',
      mimeType: 'application/pdf',
      fileExtension: '.pdf',
      fileSize: 5,
      checksumSha256: 'checksum',
    },
  }) as DispatchEnvelope<IngestionDispatchPayload>;

describe('IngestionService', () => {
  it('creates a pending pdf job and publishes a pdf parse request', async () => {
    readFileSync.mockReturnValue(Buffer.from('hello'));
    const publish = jest
      .fn()
      .mockResolvedValue(createEvent('doc.pdf.parse.requested'));
    const create = jest.fn().mockResolvedValue(createJob('job-1'));
    const jobRepository = {
      create,
      updateStatus: jest.fn().mockResolvedValue({}),
    } as unknown as IngestionJobRepository;
    const messageQueueService = { publish } as unknown as MessageQueueService;
    const service = new IngestionService(jobRepository, messageQueueService);

    const result = await service.createJobFromUpload(
      {
        originalname: 'doc.pdf',
        mimetype: 'application/pdf',
        path: '/tmp/file.pdf',
        size: 5,
      } as Express.Multer.File,
      'user-1',
      'corr-1',
      { platform: 'telegram' },
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        fileType: 'pdf',
        classification: 'unknown',
        checksumSha256: crypto
          .createHash('sha256')
          .update('hello')
          .digest('hex'),
        correlationId: 'corr-1',
        metadata: expect.objectContaining({
          sourceContext: { platform: 'telegram' },
        }) as IngestionJob['metadata'],
      }),
    );
    expect(publish).toHaveBeenCalledWith(
      'doc.pdf.parse.requested',
      expect.objectContaining({
        jobId: 'job-1',
        fileId: expect.any(String) as string,
        userId: 'user-1',
        fileType: 'pdf',
        classification: 'unknown',
        originalFilename: 'doc.pdf',
        storagePath: '/tmp/file.pdf',
        mimeType: 'application/pdf',
        fileExtension: '.pdf',
        fileSize: 5,
        checksumSha256: crypto
          .createHash('sha256')
          .update('hello')
          .digest('hex'),
        sourceContext: { platform: 'telegram' },
      }),
      'corr-1',
    );
    expect(result.event).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        eventType: 'doc.pdf.parse.requested',
        correlationId: 'corr-1',
        attempt: 1,
        payload: expect.objectContaining({
          jobId: 'job-1',
          userId: 'user-1',
          fileType: 'pdf',
        }) as IngestionDispatchPayload,
      }),
    );
  });

  it('creates a pending image job and publishes an image classify request', async () => {
    readFileSync.mockReturnValue(Buffer.from('image-bytes'));
    const publish = jest
      .fn()
      .mockResolvedValue(createEvent('image.classify.requested'));
    const create = jest.fn().mockResolvedValue(createJob('job-2'));
    const jobRepository = {
      create,
      updateStatus: jest.fn().mockResolvedValue({}),
    } as unknown as IngestionJobRepository;
    const messageQueueService = { publish } as unknown as MessageQueueService;
    const service = new IngestionService(jobRepository, messageQueueService);

    const result = await service.createJobFromUpload(
      {
        originalname: 'photo.png',
        mimetype: 'image/png',
        path: '/tmp/photo.png',
        size: 11,
      } as Express.Multer.File,
      'user-2',
      'corr-2',
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-2',
        fileType: 'image',
        classification: 'unknown',
        checksumSha256: crypto
          .createHash('sha256')
          .update('image-bytes')
          .digest('hex'),
        correlationId: 'corr-2',
      }),
    );
    expect(publish).toHaveBeenCalledWith(
      'image.classify.requested',
      expect.objectContaining({
        jobId: 'job-2',
        userId: 'user-2',
        fileType: 'image',
      }),
      'corr-2',
    );
    expect(result.event.eventType).toBe('image.classify.requested');
  });

  it('marks the job as failed when publish fails', async () => {
    jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('hello'));
    const publishError = new Error('broker unavailable');
    const publish = jest.fn().mockRejectedValue(publishError);
    const updateStatus = jest.fn().mockResolvedValue({});
    const jobRepository = {
      create: jest.fn().mockResolvedValue(createJob('job-3')),
      updateStatus,
    } as unknown as IngestionJobRepository;
    const service = new IngestionService(jobRepository, {
      publish,
    } as unknown as MessageQueueService);

    await expect(
      service.createJobFromUpload(
        {
          originalname: 'doc.pdf',
          mimetype: 'application/pdf',
          path: '/tmp/file.pdf',
          size: 5,
        } as Express.Multer.File,
        'user-3',
        'corr-3',
      ),
    ).rejects.toThrow('broker unavailable');

    expect(updateStatus).toHaveBeenCalledWith(
      'job-3',
      'failed',
      expect.objectContaining({ errorMessage: 'broker unavailable' }),
    );
  });

  it('rejects unsupported uploads', async () => {
    const service = new IngestionService(
      {} as unknown as IngestionJobRepository,
      { publish: jest.fn() } as unknown as MessageQueueService,
    );

    await expect(
      service.createJobFromUpload(
        {
          originalname: 'notes.txt',
          mimetype: 'text/plain',
          path: '/tmp/file.txt',
          size: 1,
        } as Express.Multer.File,
        'user-1',
        'corr-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
