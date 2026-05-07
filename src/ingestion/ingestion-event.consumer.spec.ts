import { Test, TestingModule } from '@nestjs/testing';
import { IngestionEventConsumer } from './ingestion-event.consumer';
import { IngestionJobRepository } from '@repositories/ingestion-job.repository';

describe('IngestionEventConsumer', () => {
  let consumer: IngestionEventConsumer;
  let repository: IngestionJobRepository;

  beforeEach(async () => {
    const mockRepository = {
      findById: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionEventConsumer,
        {
          provide: IngestionJobRepository,
          useValue: mockRepository,
        },
      ],
    }).compile();

    consumer = module.get<IngestionEventConsumer>(IngestionEventConsumer);
    repository = module.get<IngestionJobRepository>(IngestionJobRepository);
  });

  it('updates job status to completed on doc.pdf.parse.completed event', async () => {
    const job = { id: 'job-123', status: 'processing', extractedText: null };
    (repository.findById as jest.Mock).mockResolvedValue(job);
    (repository.save as jest.Mock).mockResolvedValue({ ...job, status: 'completed' });

    await consumer.handleParseCompleted({
      jobId: 'job-123',
      extractedText: 'Extracted PDF content',
    });

    expect(repository.findById).toHaveBeenCalledWith('job-123');
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        extractedText: 'Extracted PDF content',
      }),
    );
  });

  it('updates job status to failed on job.failed event', async () => {
    const job = { id: 'job-123', status: 'processing' };
    (repository.findById as jest.Mock).mockResolvedValue(job);
    (repository.save as jest.Mock).mockResolvedValue({ ...job, status: 'failed' });

    await consumer.handleJobFailed({
      jobId: 'job-123',
      error: 'PDF parsing failed: corrupted file',
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorMessage: 'PDF parsing failed: corrupted file',
      }),
    );
  });

  it('updates job status on image.classify.completed event', async () => {
    const job = { id: 'job-456', status: 'processing' };
    (repository.findById as jest.Mock).mockResolvedValue(job);
    (repository.save as jest.Mock).mockResolvedValue({ ...job, status: 'completed' });

    await consumer.handleClassifyCompleted({
      jobId: 'job-456',
      extractedText: 'OCR text from image',
      classification: 'receipt',
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        extractedText: 'OCR text from image',
      }),
    );
  });
});
