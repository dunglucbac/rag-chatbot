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
});
