import { MessageQueueBrokerService } from '@modules/message-queue/broker/broker.service';
import { MessageQueueService } from './publisher.service';

describe('MessageQueueService', () => {
  it('publishes standardized envelopes through the shared broker channel', async () => {
    const publish = jest.fn().mockReturnValue(true);
    const connect = jest.fn().mockResolvedValue({
      channel: { publish },
      exchange: 'ingest.topic',
    });
    const broker = {
      connect,
    } as unknown as MessageQueueBrokerService;

    const service = new MessageQueueService(broker);
    const envelope = await service.publish('ingest.image.uploaded', {
      fileId: 'file-123',
    });

    expect(connect).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(
      'ingest.topic',
      'ingest.image.uploaded',
      expect.any(Buffer),
      expect.objectContaining({
        contentType: 'application/json',
        messageId: envelope.eventId,
        persistent: true,
      }),
    );
    expect(envelope.eventType).toBe('ingest.image.uploaded');
  });
});
