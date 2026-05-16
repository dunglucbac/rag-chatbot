import { Test, TestingModule } from '@nestjs/testing';
import { ReceiptParsedConsumer } from './receipt-parsed.consumer';
import { ReceiptService } from './receipt.service';
import { MessageRouter } from '../message-queue/router/message-router.service';
import { IngestionJobRepository } from '../repositories/ingestion-job.repository';

describe('ReceiptParsedConsumer', () => {
  let consumer: ReceiptParsedConsumer;
  let service: ReceiptService;
  let jobRepo: IngestionJobRepository;

  beforeEach(async () => {
    const mockService = {
      saveFromEvent: jest.fn(),
    };
    const mockRouter = {
      register: jest.fn(),
    };
    const mockJobRepo = {
      findById: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptParsedConsumer,
        { provide: ReceiptService, useValue: mockService },
        { provide: MessageRouter, useValue: mockRouter },
        { provide: IngestionJobRepository, useValue: mockJobRepo },
      ],
    }).compile();

    consumer = module.get<ReceiptParsedConsumer>(ReceiptParsedConsumer);
    service = module.get<ReceiptService>(ReceiptService);
    jobRepo = module.get<IngestionJobRepository>(IngestionJobRepository);
  });

  it('registers for receipt.parsed events on init', () => {
    // onModuleInit is called automatically by NestJS, test registration
    consumer.onModuleInit();
    const router = (consumer as unknown as { router: MessageRouter }).router;
    expect(router.register).toHaveBeenCalledWith(
      'receipt.parsed',
      expect.any(Function),
    );
  });

  it('saves receipt and marks job completed when receipt.parsed event is received', async () => {
    const payload = {
      jobId: 'job-123',
      userId: 'user-456',
      receipt: {
        merchant: 'Starbucks',
        purchasedAt: '2026-05-05T10:30:00Z',
        total: 12.5,
        currency: 'USD',
      },
      lineItems: [{ name: 'Latte', totalPrice: 4.5 }],
    };

    const envelope = {
      eventId: 'evt-1',
      eventType: 'receipt.parsed',
      correlationId: 'corr-123',
      schemaVersion: 1,
      attempt: 1,
      createdAt: new Date().toISOString(),
      payload,
    };

    (jobRepo.findById as jest.Mock).mockResolvedValue({
      id: 'job-123',
      status: 'pending',
    });

    await consumer.handleReceiptParsed(envelope);

    expect(service.saveFromEvent).toHaveBeenCalledWith(payload);
    expect(jobRepo.findById).toHaveBeenCalledWith('job-123');
    expect(jobRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        classification: 'receipt',
        completedAt: expect.any(Date) as Date,
      }),
    );
  });
});
