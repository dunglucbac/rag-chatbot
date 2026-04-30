import { MessageQueueRoutingService } from '@modules/message-queue/routing/routing.service';
import { MessageQueueTransportService } from './transport.service';

describe('MessageQueueTransportService', () => {
  it('acks valid broker messages and routes validated envelopes', () => {
    const ack = jest.fn();
    const nack = jest.fn();
    const route = jest.fn().mockReturnValue('image');
    const channel = { ack, nack } as never;
    const msg = {
      content: Buffer.from(
        JSON.stringify({ eventType: 'ingest.image.uploaded' }),
      ),
    } as never;

    new MessageQueueTransportService({
      route,
    } as MessageQueueRoutingService).handleMessage(channel, msg, 'image');

    expect(route).toHaveBeenCalledWith('ingest.image.uploaded');
    expect(ack).toHaveBeenCalledWith(msg);
    expect(nack).not.toHaveBeenCalled();
  });

  it('nacks invalid broker messages without requeue', () => {
    const ack = jest.fn();
    const nack = jest.fn();
    const channel = { ack, nack } as never;
    const msg = { content: Buffer.from('{') } as never;

    new MessageQueueTransportService({
      route: jest.fn(),
    } as MessageQueueRoutingService).handleMessage(channel, msg, 'pdf');

    expect(nack).toHaveBeenCalledWith(msg, false, false);
    expect(ack).not.toHaveBeenCalled();
  });
});
