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
        JSON.stringify({
          schemaVersion: 1,
          eventType: 'image.classify.requested',
        }),
      ),
    } as never;

    const jobRepository = {
      updateStatus: jest.fn(),
    } as never;

    new MessageQueueTransportService(
      {
        route,
      } as MessageQueueRoutingService,
      jobRepository,
    ).handleMessage(channel, msg, 'image');

    expect(route).toHaveBeenCalledWith('image.classify.requested');
    expect(ack).toHaveBeenCalledWith(msg);
    expect(nack).not.toHaveBeenCalled();
  });

  it('nacks invalid broker messages without requeue', () => {
    const ack = jest.fn();
    const nack = jest.fn();
    const channel = { ack, nack } as never;
    const msg = { content: Buffer.from('{') } as never;

    const jobRepository = {
      updateStatus: jest.fn(),
    } as never;

    new MessageQueueTransportService(
      {
        route: jest.fn(),
      } as MessageQueueRoutingService,
      jobRepository,
    ).handleMessage(channel, msg, 'pdf');

    expect(nack).toHaveBeenCalledWith(msg, false, false);
    expect(ack).not.toHaveBeenCalled();
  });
});
