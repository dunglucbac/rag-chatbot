import { Test, TestingModule } from '@nestjs/testing';
import { ReceiptPaymentConsumer } from './receipt-payment.consumer';
import { TelegramService } from '../telegram/telegram.service';
import { MessageQueueService } from '../message-queue/publisher/publisher.service';

describe('ReceiptPaymentConsumer', () => {
  let consumer: ReceiptPaymentConsumer;
  let telegramService: TelegramService;
  let messageQueueService: MessageQueueService;

  beforeEach(async () => {
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
      ],
    }).compile();

    consumer = module.get<ReceiptPaymentConsumer>(ReceiptPaymentConsumer);
    telegramService = module.get<TelegramService>(TelegramService);
    messageQueueService = module.get<MessageQueueService>(MessageQueueService);
  });

  it('prompts user with payment amount extracted from event', async () => {
    const paymentEvent = {
      jobId: 'job-123',
      userId: '12345',
      extractedText: 'Bank Transfer\nAmount: $50.00\nTo: ABC Store',
    };

    await consumer.handlePaymentDetected(paymentEvent);

    expect(telegramService.bot.telegram.sendMessage).toHaveBeenCalledWith(
      '12345',
      expect.stringContaining('$50.00'),
    );
  });

  it('handles user response and publishes receipt.parsed event', async () => {
    const paymentContext = {
      jobId: 'job-123',
      userId: '12345',
      paymentAmount: 50.00,
      paymentDate: new Date('2026-05-05T14:20:00Z'),
    };

    const userMessage = 'Bought groceries and detergent at Walmart';

    await consumer.handleUserResponse(paymentContext, userMessage);

    expect(messageQueueService.publish).toHaveBeenCalledWith(
      'receipt.parsed',
      expect.objectContaining({
        jobId: 'job-123',
        userId: '12345',
        receipt: expect.objectContaining({
          merchant: 'Walmart',
          total: 50.00,
        }),
      }),
    );
  });
});
