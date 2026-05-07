import { Test, TestingModule } from '@nestjs/testing';
import { ReceiptParsedConsumer } from './receipt-parsed.consumer';
import { ReceiptService } from './receipt.service';

describe('ReceiptParsedConsumer', () => {
  let consumer: ReceiptParsedConsumer;
  let service: ReceiptService;

  beforeEach(async () => {
    const mockService = {
      saveFromEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptParsedConsumer,
        {
          provide: ReceiptService,
          useValue: mockService,
        },
      ],
    }).compile();

    consumer = module.get<ReceiptParsedConsumer>(ReceiptParsedConsumer);
    service = module.get<ReceiptService>(ReceiptService);
  });

  it('saves receipt when receipt.parsed event is received', async () => {
    const event = {
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

    await consumer.handleReceiptParsed(event);

    expect(service.saveFromEvent).toHaveBeenCalledWith(event);
  });
});
