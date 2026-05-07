import { Test, TestingModule } from '@nestjs/testing';
import { ReceiptReviewConsumer } from './receipt-review.consumer';
import { TelegramService } from '../telegram/telegram.service';

describe('ReceiptReviewConsumer', () => {
  let consumer: ReceiptReviewConsumer;
  let telegramService: TelegramService;

  beforeEach(async () => {
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
      ],
    }).compile();

    consumer = module.get<ReceiptReviewConsumer>(ReceiptReviewConsumer);
    telegramService = module.get<TelegramService>(TelegramService);
  });

  it('sends confirmation prompt with receipt details and inline keyboard', async () => {
    const reviewEvent = {
      jobId: 'job-123',
      userId: 'user-456',
      confidence: 0.55,
      receipt: {
        merchant: 'Starbucks',
        purchasedAt: '2026-05-05T10:30:00Z',
        total: 12.50,
        currency: 'USD',
      },
      lineItems: [
        { name: 'Latte', totalPrice: 4.50 },
      ],
    };

    await consumer.handleNeedsReview(reviewEvent);

    expect(telegramService.bot.telegram.sendMessage).toHaveBeenCalledWith(
      'user-456',
      expect.stringContaining('Starbucks'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({ text: expect.stringContaining('Looks good') }),
            ]),
          ]),
        }),
      }),
    );
  });

  it('formats receipt line items in the confirmation message', async () => {
    const reviewEvent = {
      jobId: 'job-123',
      userId: 'user-456',
      confidence: 0.60,
      receipt: {
        merchant: 'Walmart',
        purchasedAt: '2026-05-05T14:20:00Z',
        total: 50.00,
        currency: 'USD',
      },
      lineItems: [
        { name: 'Groceries', totalPrice: 30.00 },
        { name: 'Detergent', totalPrice: 20.00 },
      ],
    };

    await consumer.handleNeedsReview(reviewEvent);

    const callArgs = (telegramService.bot.telegram.sendMessage as jest.Mock).mock.calls[0];
    expect(callArgs[1]).toContain('Groceries');
    expect(callArgs[1]).toContain('Detergent');
    expect(callArgs[1]).toContain('$50.00');
  });
});
