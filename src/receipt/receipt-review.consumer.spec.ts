import { Test, TestingModule } from '@nestjs/testing';
import { ReceiptReviewConsumer } from './receipt-review.consumer';
import { TelegramService } from '../telegram/telegram.service';
import { MessageRouter } from '../message-queue/router/message-router.service';
import { IngestionJobRepository } from '../repositories/ingestion-job.repository';
import { NeedsReviewPayload } from '@modules/common/event-payloads.types';
import { EventEnvelope } from '@modules/common/common.types';

describe('ReceiptReviewConsumer', () => {
  let consumer: ReceiptReviewConsumer;
  let jobRepo: IngestionJobRepository;
  let sendMessage: jest.Mock<Promise<void>, [string, string, unknown]>;

  beforeEach(async () => {
    const mockRouter = { register: jest.fn() };
    const mockJobRepo = { findById: jest.fn(), save: jest.fn() };
    sendMessage = jest.fn<Promise<void>, [string, string, unknown]>();
    sendMessage.mockResolvedValue();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptReviewConsumer,
        {
          provide: TelegramService,
          useValue: {
            bot: {
              telegram: {
                sendMessage,
              },
            },
          },
        },
        { provide: MessageRouter, useValue: mockRouter },
        { provide: IngestionJobRepository, useValue: mockJobRepo },
      ],
    }).compile();

    consumer = module.get<ReceiptReviewConsumer>(ReceiptReviewConsumer);
    jobRepo = module.get<IngestionJobRepository>(IngestionJobRepository);
  });

  function envelope(
    payload: NeedsReviewPayload,
  ): EventEnvelope<NeedsReviewPayload> {
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
        lineItems: [],
        confidence: 0.55,
        discrepancy: null,
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

    const call = sendMessage.mock.calls[0];
    if (!call) throw new Error('Confirmation message was not sent');
    const [recipient, message, options] = call;
    expect(recipient).toBe('user-456');
    expect(message).toContain('Starbucks');
    expect(options).toEqual({
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Looks good', callback_data: 'review:approve:job-123' },
            { text: 'Edit', callback_data: 'review:edit:job-123' },
            { text: 'Reject', callback_data: 'review:reject:job-123' },
          ],
        ],
      },
    });
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
          lineItems: [
            { name: 'Groceries', totalPrice: 30.0 },
            { name: 'Detergent', totalPrice: 20.0 },
          ],
          confidence: 0.6,
          discrepancy: null,
        },
      }),
    );

    const call = sendMessage.mock.calls[0];
    if (!call) throw new Error('Confirmation message was not sent');
    const [recipient, message] = call;
    expect(recipient).toBe('user-456');
    expect(message).toContain('Groceries');
    expect(message).toContain('Detergent');
    expect(message).toContain('$50.00');
  });
});
