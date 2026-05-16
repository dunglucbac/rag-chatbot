import { Test, TestingModule } from '@nestjs/testing';
import { ReceiptReviewConsumer } from './receipt-review.consumer';
import { TelegramService } from '../telegram/telegram.service';
import { MessageRouter } from '../message-queue/router/message-router.service';
import { IngestionJobRepository } from '../repositories/ingestion-job.repository';
import { NeedsReviewPayload } from '@modules/common/event-payloads.types';
import { EventEnvelope } from '@modules/common/common.types';

describe('ReceiptReviewConsumer', () => {
  let consumer: ReceiptReviewConsumer;
  let telegramService: TelegramService;
  let jobRepo: IngestionJobRepository;

  beforeEach(async () => {
    const mockRouter = { register: jest.fn() };
    const mockJobRepo = { findById: jest.fn(), save: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptReviewConsumer,
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
        { provide: MessageRouter, useValue: mockRouter },
        { provide: IngestionJobRepository, useValue: mockJobRepo },
      ],
    }).compile();

    consumer = module.get<ReceiptReviewConsumer>(ReceiptReviewConsumer);
    telegramService = module.get<TelegramService>(TelegramService);
    jobRepo = module.get<IngestionJobRepository>(IngestionJobRepository);
  });

  function envelope(payload: Record<string, unknown>) {
    return {
      eventId: 'evt-1',
      eventType: 'receipt.needs_review',
      correlationId: 'corr-123',
      schemaVersion: 1,
      attempt: 1,
      createdAt: new Date().toISOString(),
      payload,
    };
  }

  it('sends confirmation prompt with receipt details and inline keyboard', async () => {
    (jobRepo.findById as jest.Mock).mockResolvedValue({
      id: 'job-123',
      status: 'pending',
    });
    const payload: NeedsReviewPayload = {
      jobId: 'job-123',
      userId: 'user-456',
      confidence: 0.55,
      receipt: {
        merchant: 'Starbucks',
        purchasedAt: '2026-05-05T10:30:00Z',
        total: 12.5,
        currency: 'USD',
      },
    };
    const envelope: EventEnvelope<NeedsReviewPayload> = {
      eventId: 'evt-1',
      eventType: 'receipt.needs_review',
      correlationId: 'corr-123',
      schemaVersion: 1,
      attempt: 1,
      createdAt: new Date().toISOString(),
      payload,
    };
    await consumer.handleNeedsReview(envelope);

    expect(telegramService.bot.telegram.sendMessage).toHaveBeenCalledWith(
      'user-456',
      expect.stringContaining('Starbucks'),
      expect.objectContaining({ reply_markup: expect.any(Object) }),
    );

    const callArgs = (telegramService.bot.telegram.sendMessage as jest.Mock).mock
      .calls[0];
    const keyboard =
      callArgs[2].reply_markup.inline_keyboard;
    expect(keyboard[0][0].text).toContain('Looks good');
    expect(keyboard[0][0].callback_data).toBe('review:approve:job-123');
    expect(keyboard[0][1].text).toContain('Edit');
    expect(keyboard[0][2].text).toContain('Reject');
  });

  it('formats receipt line items in the confirmation message', async () => {
    (jobRepo.findById as jest.Mock).mockResolvedValue({
      id: 'job-123',
      status: 'pending',
    });

    await consumer.handleNeedsReview(
      envelope({
        jobId: 'job-123',
        userId: 'user-456',
        confidence: 0.6,
        receipt: {
          merchant: 'Walmart',
          purchasedAt: '2026-05-05T14:20:00Z',
          total: 50.0,
          currency: 'USD',
        },
        lineItems: [
          { name: 'Groceries', totalPrice: 30.0 },
          { name: 'Detergent', totalPrice: 20.0 },
        ],
      }),
    );

    const callArgs = (telegramService.bot.telegram.sendMessage as jest.Mock)
      .mock.calls[0];
    expect(callArgs[1]).toContain('Groceries');
    expect(callArgs[1]).toContain('Detergent');
    expect(callArgs[1]).toContain('$50.00');
  });
});
