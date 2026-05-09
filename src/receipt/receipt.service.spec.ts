import { Test, TestingModule } from '@nestjs/testing';
import { ReceiptService } from './receipt.service';
import { ReceiptRepository } from './repositories/receipt.repository';

describe('ReceiptService', () => {
  let service: ReceiptService;
  let repository: ReceiptRepository;

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptService,
        {
          provide: ReceiptRepository,
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ReceiptService>(ReceiptService);
    repository = module.get<ReceiptRepository>(ReceiptRepository);
  });

  it('can save a receipt from parsed event data', async () => {
    const eventData = {
      jobId: 'job-123',
      userId: 'user-456',
      receipt: {
        merchant: 'Starbucks',
        purchasedAt: '2026-05-05T10:30:00Z',
        total: 12.5,
        tax: 1.15,
        currency: 'USD',
      },
      lineItems: [
        { name: 'Latte', quantity: 1, unitPrice: 4.5, totalPrice: 4.5 },
      ],
    };

    const mockReceipt = { id: 'receipt-123', ...eventData.receipt };
    (repository.create as jest.Mock).mockResolvedValue(mockReceipt);

    const result = await service.saveFromEvent(eventData);

    expect(result.id).toBe('receipt-123');
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-456',
        merchant: 'Starbucks',
        total: 12.5,
      }),
    );
  });

  it('saves receipt items along with the receipt', async () => {
    const eventData = {
      jobId: 'job-123',
      userId: 'user-456',
      receipt: {
        merchant: 'Starbucks',
        purchasedAt: '2026-05-05T10:30:00Z',
        total: 12.5,
        currency: 'USD',
      },
      lineItems: [
        { name: 'Latte', quantity: 1, unitPrice: 4.5, totalPrice: 4.5 },
        { name: 'Croissant', quantity: 2, unitPrice: 3.0, totalPrice: 6.0 },
      ],
    };

    const mockReceipt = { id: 'receipt-123', ...eventData.receipt };
    (repository.create as jest.Mock).mockResolvedValue(mockReceipt);

    const result = await service.saveFromEvent(eventData);

    expect(result.id).toBe('receipt-123');
    // Verify receipt was created with line items
    const createCall = (repository.create as jest.Mock).mock.calls[0][0];
    expect(createCall.items).toBeDefined();
    expect(createCall.items).toHaveLength(2);
    expect(createCall.items[0].name).toBe('Latte');
  });

  it('rejects duplicate receipts', async () => {
    const eventData = {
      jobId: 'job-123',
      userId: 'user-456',
      receipt: {
        merchant: 'Starbucks',
        purchasedAt: '2026-05-05T10:30:00Z',
        total: 12.5,
        currency: 'USD',
      },
      lineItems: [],
    };

    const duplicateError = new Error('duplicate key value violates unique constraint');
    (duplicateError as any).code = '23505';
    (repository.create as jest.Mock).mockRejectedValue(duplicateError);

    await expect(service.saveFromEvent(eventData)).rejects.toThrow('duplicate');
  });

  it('calculates checksum from receipt content', async () => {
    const eventData = {
      jobId: 'job-123',
      userId: 'user-456',
      rawText: 'Starbucks Receipt\nTotal: $12.50',
      receipt: {
        merchant: 'Starbucks',
        purchasedAt: '2026-05-05T10:30:00Z',
        total: 12.5,
        currency: 'USD',
      },
      lineItems: [],
    };

    const mockReceipt = { id: 'receipt-123' };
    (repository.create as jest.Mock).mockResolvedValue(mockReceipt);

    await service.saveFromEvent(eventData);

    const createCall = (repository.create as jest.Mock).mock.calls[0][0];
    expect(createCall.checksumSha256).toBeDefined();
    expect(createCall.checksumSha256).not.toBe('job-123');
    expect(createCall.checksumSha256.length).toBe(64); // SHA256 hex length
  });
});
