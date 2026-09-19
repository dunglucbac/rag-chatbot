import { MessageRouter } from './message-router.service';

describe('MessageRouter', () => {
  it('rejects unknown event types instead of treating them as successful', async () => {
    const router = new MessageRouter();

    await expect(
      router.dispatch({
        eventType: 'event.unknown',
        eventId: 'event-123',
        schemaVersion: 1,
        correlationId: 'correlation-123',
        attempt: 1,
        createdAt: '2026-09-18T00:00:00.000Z',
      }),
    ).rejects.toThrow('No handler registered for eventType=event.unknown');
  });

  it('rejects receipt payloads that use top-level line items', async () => {
    const router = new MessageRouter();
    const handler = jest.fn();
    router.register('receipt.parsed', handler);

    await expect(
      router.dispatch({
        eventType: 'receipt.parsed',
        eventId: 'event-123',
        schemaVersion: 1,
        correlationId: 'correlation-123',
        attempt: 1,
        createdAt: '2026-09-19T00:00:00.000Z',
        payload: {
          jobId: 'job-123',
          userId: 'user-123',
          receipt: {
            merchant: 'Starbucks',
            purchasedAt: '2026-09-19T00:00:00.000Z',
            total: 4.5,
            currency: 'USD',
            confidence: 1,
            discrepancy: null,
          },
          lineItems: [{ name: 'Latte', totalPrice: 4.5 }],
        },
      }),
    ).rejects.toThrow('Invalid payload for eventType=receipt.parsed');
    expect(handler).not.toHaveBeenCalled();
  });

  it('dispatches receipt payloads with nested line items', async () => {
    const router = new MessageRouter();
    const handler = jest.fn();
    router.register('receipt.parsed', handler);
    const envelope = {
      eventType: 'receipt.parsed',
      eventId: 'event-123',
      schemaVersion: 1,
      correlationId: 'correlation-123',
      attempt: 1,
      createdAt: '2026-09-19T00:00:00.000Z',
      payload: {
        jobId: 'job-123',
        userId: 'user-123',
        receipt: {
          merchant: 'Starbucks',
          purchasedAt: '2026-09-19T00:00:00.000Z',
          total: 4.5,
          currency: 'USD',
          lineItems: [{ name: 'Latte', totalPrice: 4.5 }],
          confidence: 1,
          discrepancy: null,
        },
      },
    };

    await router.dispatch(envelope);

    expect(handler).toHaveBeenCalledWith(envelope);
  });
});
