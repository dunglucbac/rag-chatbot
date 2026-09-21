import { BadRequestException } from '@nestjs/common';
import { IngestionService } from '@modules/ingestion/ingestion.service';
import { IngestionJobRepository } from '@repositories/ingestion-job.repository';
import { MessageQueueService } from '@modules/message-queue';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('IngestionService', () => {
  it('creates a pending PDF ingestion job and publishes a requested-work event', async () => {
    const tmpFile = path.join(os.tmpdir(), `ingestion-${Date.now()}.pdf`);
    fs.writeFileSync(tmpFile, 'pdf-content');
    type CreateInput = Parameters<IngestionJobRepository['create']>[0];
    type CreateResult = { id: string } & CreateInput;
    const createImpl = (data: CreateInput): CreateResult => ({
      id: 'job-123',
      ...data,
    });
    const createOrGetByChecksum = jest
      .fn()
      .mockImplementation((data: CreateInput) => ({
        job: createImpl(data),
        created: true,
      }));
    const publish = jest.fn().mockResolvedValue({
      eventId: 'evt-123',
      eventType: 'doc.pdf.parse.requested',
    });

    const jobRepository = {
      createOrGetByChecksum,
    } as unknown as IngestionJobRepository;
    const messageQueueService = { publish } as unknown as MessageQueueService;
    const service = new IngestionService(jobRepository, messageQueueService);

    const file = {
      originalname: 'statement.pdf',
      mimetype: 'application/pdf',
      path: tmpFile,
      size: 1234,
    } as unknown as Express.Multer.File;

    const result = await service.createJobFromUpload(
      file,
      'user-123',
      'corr-123',
    );

    expect(createOrGetByChecksum).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        originalFilename: 'statement.pdf',
        storagePath: tmpFile,
        mimeType: 'application/pdf',
        fileType: 'pdf',
        classification: 'unknown',
        status: 'pending',
        correlationId: 'corr-123',
      }),
    );
    expect(publish).toHaveBeenCalledWith(
      'doc.pdf.parse.requested',
      expect.objectContaining({
        classification: 'unknown',
        correlationId: 'corr-123',
        fileExtension: '.pdf',
        fileSize: 1234,
        fileType: 'pdf',
        jobId: 'job-123',
        mimeType: 'application/pdf',
        originalFilename: 'statement.pdf',
        userId: 'user-123',
      }),
      'corr-123',
      1,
      1,
    );
    expect(result.job.id).toBe('job-123');
  });

  it('creates a pending image ingestion job and publishes an image classification request', async () => {
    const tmpFile = path.join(os.tmpdir(), `ingestion-${Date.now()}.png`);
    fs.writeFileSync(tmpFile, 'image-content');
    type CreateInput = Parameters<IngestionJobRepository['create']>[0];
    type CreateResult = { id: string } & CreateInput;
    const createImpl = (data: CreateInput): CreateResult => ({
      id: 'job-456',
      ...data,
    });
    const createOrGetByChecksum = jest
      .fn()
      .mockImplementation((data: CreateInput) => ({
        job: createImpl(data),
        created: true,
      }));
    const publish = jest.fn().mockResolvedValue({
      eventId: 'evt-456',
      eventType: 'image.classify.requested',
    });

    const jobRepository = {
      createOrGetByChecksum,
    } as unknown as IngestionJobRepository;
    const messageQueueService = { publish } as unknown as MessageQueueService;
    const service = new IngestionService(jobRepository, messageQueueService);

    const file = {
      originalname: 'receipt.png',
      mimetype: 'image/png',
      path: tmpFile,
      size: 456,
    } as unknown as Express.Multer.File;

    const result = await service.createJobFromUpload(
      file,
      'user-456',
      'corr-456',
    );

    expect(createOrGetByChecksum).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-456',
        originalFilename: 'receipt.png',
        storagePath: tmpFile,
        mimeType: 'image/png',
        fileType: 'image',
        classification: 'unknown',
        status: 'pending',
        correlationId: 'corr-456',
      }),
    );
    expect(publish).toHaveBeenCalledWith(
      'image.classify.requested',
      expect.objectContaining({
        jobId: 'job-456',
        userId: 'user-456',
        fileType: 'image',
        classification: 'unknown',
        correlationId: 'corr-456',
      }),
      'corr-456',
      1,
      1,
    );
    expect(result.job.id).toBe('job-456');
  });

  it('reuses an existing job and does not publish duplicate work', async () => {
    const tmpFile = path.join(os.tmpdir(), `ingestion-${Date.now()}.pdf`);
    fs.writeFileSync(tmpFile, 'duplicate-content');
    const existingJob = { id: 'job-existing' };
    const createOrGetByChecksum = jest.fn().mockResolvedValue({
      job: existingJob,
      created: false,
    });
    const publish = jest.fn();
    const service = new IngestionService(
      { createOrGetByChecksum } as unknown as IngestionJobRepository,
      { publish } as unknown as MessageQueueService,
    );

    const result = await service.createJobFromUpload(
      {
        originalname: 'duplicate.pdf',
        mimetype: 'application/pdf',
        path: tmpFile,
        size: 17,
      } as unknown as Express.Multer.File,
      'user-123',
    );

    expect(result).toEqual({ job: existingJob, deduplicated: true });
    expect(publish).not.toHaveBeenCalled();
    expect(fs.existsSync(tmpFile)).toBe(false);
  });

  it('rejects unsupported file uploads', async () => {
    const jobRepository = {
      create: jest.fn(),
    } as unknown as IngestionJobRepository;
    const messageQueueService = {
      publish: jest.fn(),
    } as unknown as MessageQueueService;
    const service = new IngestionService(jobRepository, messageQueueService);

    const file = {
      correlationId: 'corr-123',
      originalname: 'notes.txt',
      mimetype: 'text/plain',
      path: '/tmp/notes.txt',
      size: 10,
    } as unknown as Express.Multer.File;

    await expect(
      service.createJobFromUpload(file, 'user-123'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
