import { MessageQueueBrokerService } from '@modules/message-queue/broker/broker.service';
import { MessageQueueService } from './publisher.service';

describe('MessageQueueService', () => {
  it('publishes versioned envelopes through the shared broker channel', async () => {
    const publish = jest.fn().mockReturnValue(true);
    const connect = jest.fn().mockResolvedValue({
      channel: { publish },
      exchange: 'ingest.topic',
    });
    const broker = {
      connect,
    } as unknown as MessageQueueBrokerService;

    const service = new MessageQueueService(broker);
    const envelope = await service.publish(
      'image.classify.requested',
      {
        fileId: 'file-123',
      },
      'corr-123',
    );

    expect(connect).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(
      'ingest.topic',
      'image.classify.requested',
      expect.any(Buffer),
      expect.objectContaining({
        contentType: 'application/json',
        messageId: envelope.eventId,
        persistent: true,
      }),
    );
    expect(envelope).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        eventType: 'image.classify.requested',
        correlationId: 'corr-123',
        attempt: 1,
        payload: {
          fileId: 'file-123',
        },
      }),
    );
    expect(envelope.eventId).toEqual(expect.any(String));
    expect(envelope.createdAt).toEqual(expect.any(String));
  });
});
