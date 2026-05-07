import { Test, TestingModule } from '@nestjs/testing';
import { ReceiptPaymentConsumer } from './receipt-payment.consumer';
import { TelegramService } from '../telegram/telegram.service';

describe('ReceiptPaymentConsumer', () => {
  let consumer: ReceiptPaymentConsumer;
  let telegramService: TelegramService;

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
      ],
    }).compile();

    consumer = module.get<ReceiptPaymentConsumer>(ReceiptPaymentConsumer);
    telegramService = module.get<TelegramService>(TelegramService);
  });

  it('should prompt user via Telegram when payment is detected', async () => {
    const paymentEvent = {
      jobId: 'job-123',
      userId: '12345',
      extractedText: 'Bank Transfer\nAmount: $50.00\nTo: ABC Store',
    };

    await consumer.handlePaymentDetected(paymentEvent);

    expect(telegramService.bot.telegram.sendMessage).toHaveBeenCalledWith(
      '12345',
      expect.stringContaining('payment detected'),
    );
  });
});
