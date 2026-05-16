import { Test, TestingModule } from '@nestjs/testing';
import { ReceiptPaymentConsumer } from './receipt-payment.consumer';
import { TelegramService } from '../telegram/telegram.service';
import { MessageQueueService } from '../message-queue/publisher/publisher.service';
import { MessageRouter } from '../message-queue/router/message-router.service';
import { IngestionJobRepository } from '../repositories/ingestion-job.repository';

describe('ReceiptPaymentConsumer', () => {
  let consumer: ReceiptPaymentConsumer;
  let telegramService: TelegramService;
  let messageQueueService: MessageQueueService;
  let jobRepo: IngestionJobRepository;

  beforeEach(async () => {
    const mockRouter = { register: jest.fn() };
    const mockJobRepo = { findById: jest.fn(), save: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptPaymentConsumer,
        {
          provide: TelegramService,
          useValue: {
            bot: {
              telegram: {
                sendMessage: jest.fn(),
              },
            },
          },
        },
        {
          provide: MessageQueueService,
          useValue: {
            publish: jest.fn(),
          },
        },
        { provide: MessageRouter, useValue: mockRouter },
        { provide: IngestionJobRepository, useValue: mockJobRepo },
      ],
    }).compile();

    consumer = module.get<ReceiptPaymentConsumer>(ReceiptPaymentConsumer);
    telegramService = module.get<TelegramService>(TelegramService);
    messageQueueService = module.get<MessageQueueService>(MessageQueueService);
    jobRepo = module.get<IngestionJobRepository>(IngestionJobRepository);
  });

  function envelope(payload: Record<string, unknown>) {
    return {
      eventId: 'evt-1',
      eventType: 'payment.detected',
      correlationId: 'corr-123',
      schemaVersion: 1,
      attempt: 1,
      createdAt: new Date().toISOString(),
      payload,
    };
  }

  it('registers for payment.detected events on init', () => {
    consumer.onModuleInit();
    const router = (consumer as any).router;
    expect(router.register).toHaveBeenCalledWith(
      'payment.detected',
      expect.any(Function),
    );
  });

  it('prompts user with payment amount and marks job needs_review', async () => {
    (jobRepo.findById as jest.Mock).mockResolvedValue({
      id: 'job-123',
      status: 'pending',
    });

    await consumer.handlePaymentDetected(
      envelope({
        jobId: 'job-123',
        userId: '12345',
        extractedText: 'Bank Transfer\nAmount: $50.00\nTo: ABC Store',
      }),
    );

    expect(telegramService.bot.telegram.sendMessage).toHaveBeenCalledWith(
      '12345',
      expect.stringContaining('$50.00'),
    );
    expect(jobRepo.findById).toHaveBeenCalledWith('job-123');
    expect(jobRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'needs_review',
        classification: 'payment',
      }),
    );
  });

  it('handles user response and publishes receipt.parsed event', async () => {
    const paymentContext = {
      jobId: 'job-123',
      userId: '12345',
      paymentAmount: 50.0,
      paymentDate: '2026-05-05T14:20:00Z',
    };

    await consumer.handleUserResponse(
      paymentContext,
      'Bought groceries and detergent at Walmart',
    );

    expect(messageQueueService.publish).toHaveBeenCalledWith(
      'receipt.parsed',
      expect.objectContaining({
        jobId: 'job-123',
        userId: '12345',
        receipt: expect.objectContaining({
          merchant: 'Walmart',
          total: 50.0,
        }),
      }),
      'job-123',
      1,
      1,
    );
  });
});
