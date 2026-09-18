import { MessageQueueBrokerService } from '@modules/message-queue/broker/broker.service';
import {
  MESSAGE_QUEUE_NESTJS_OWNED_QUEUES,
  MESSAGE_QUEUE_PYTHON_OWNED_QUEUES,
} from '@modules/message-queue/message-queue.constants';
import { MessageRouter } from '@modules/message-queue/router/message-router.service';
import { MessageQueueConsumer } from './consumer.service';

describe('MessageQueueConsumer', () => {
  it('consumes each NestJS-owned queue once using the broker channel', async () => {
    const consume = jest.fn();
    const channel = {
      assertQueue: jest.fn().mockResolvedValue(undefined),
      bindQueue: jest.fn().mockResolvedValue(undefined),
      consume,
    };
    const broker = {
      connect: jest.fn().mockResolvedValue({ channel }),
    } as unknown as MessageQueueBrokerService;
    const router = {
      register: jest.fn(),
      dispatch: jest.fn(),
    } as unknown as MessageRouter;

    const consumer = new MessageQueueConsumer(broker, router);
    await consumer.onModuleInit();

    expect(channel.consume).toHaveBeenCalledTimes(
      MESSAGE_QUEUE_NESTJS_OWNED_QUEUES.length,
    );
    expect(channel.consume).toHaveBeenCalledWith(
      'ingest.status.queue',
      expect.any(Function),
      { noAck: false },
    );
    expect(channel.consume).toHaveBeenCalledWith(
      'ingest.results.queue',
      expect.any(Function),
      { noAck: false },
    );
    for (const queue of MESSAGE_QUEUE_PYTHON_OWNED_QUEUES) {
      expect(channel.consume).not.toHaveBeenCalledWith(
        queue,
        expect.any(Function),
        { noAck: false },
      );
    }
    expect(channel.assertQueue).not.toHaveBeenCalled();
    expect(channel.bindQueue).not.toHaveBeenCalled();
  });
});
