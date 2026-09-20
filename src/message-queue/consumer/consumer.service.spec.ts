import { MessageQueueBrokerService } from '@modules/message-queue/broker/broker.service';
import {
  MESSAGE_QUEUE_RAG_APP_QUEUES,
  MESSAGE_QUEUE_WORKER_QUEUES,
} from '@modules/message-queue/message-queue.constants';
import {
  InvalidEventPayloadError,
  MessageRouter,
  UnknownEventTypeError,
} from '@modules/message-queue/router/message-router.service';
import { type ConsumeMessage } from 'amqplib';
import { MessageQueueConsumer } from './consumer.service';

type ConsumeHandler = (message: ConsumeMessage | null) => Promise<void>;
type ConsumeCall = [string, ConsumeHandler, { noAck: boolean }];

const getConsumeHandler = (consume: jest.Mock): ConsumeHandler =>
  (consume.mock.calls as unknown as ConsumeCall[])[0][1];

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
    await consumer.onApplicationBootstrap();

    expect(channel.consume).toHaveBeenCalledTimes(
      MESSAGE_QUEUE_RAG_APP_QUEUES.length,
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
    for (const queue of MESSAGE_QUEUE_WORKER_QUEUES) {
      expect(channel.consume).not.toHaveBeenCalledWith(
        queue,
        expect.any(Function),
        { noAck: false },
      );
    }
    expect(channel.assertQueue).not.toHaveBeenCalled();
    expect(channel.bindQueue).not.toHaveBeenCalled();
  });

  it('requeues a message when its handler fails instead of acknowledging it', async () => {
    const consume = jest.fn();
    const channel = {
      consume,
      ack: jest.fn(),
      nack: jest.fn(),
    };
    const broker = {
      connect: jest.fn().mockResolvedValue({ channel }),
    } as unknown as MessageQueueBrokerService;
    const router = {
      dispatch: jest.fn().mockRejectedValue(new Error('database unavailable')),
    } as unknown as MessageRouter;
    const consumer = new MessageQueueConsumer(broker, router);
    const message = {
      content: Buffer.from(
        JSON.stringify({
          eventType: 'receipt.parsed',
          correlationId: 'correlation-123',
        }),
      ),
    };

    await consumer.onApplicationBootstrap();
    const handler = getConsumeHandler(consume);
    await handler(message);

    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(message, false, true);
  });

  it('rejects unknown event types without acknowledging them', async () => {
    const consume = jest.fn();
    const channel = {
      consume,
      ack: jest.fn(),
      nack: jest.fn(),
    };
    const broker = {
      connect: jest.fn().mockResolvedValue({ channel }),
    } as unknown as MessageQueueBrokerService;
    const router = {
      dispatch: jest
        .fn()
        .mockRejectedValue(new UnknownEventTypeError('event.unknown')),
    } as unknown as MessageRouter;
    const consumer = new MessageQueueConsumer(broker, router);
    const message = {
      content: Buffer.from(
        JSON.stringify({
          eventType: 'event.unknown',
          correlationId: 'correlation-123',
        }),
      ),
    };

    await consumer.onApplicationBootstrap();
    const handler = getConsumeHandler(consume);
    await handler(message);

    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
  });

  it('dead-letters invalid event payloads without acknowledging them', async () => {
    const consume = jest.fn();
    const channel = {
      consume,
      ack: jest.fn(),
      nack: jest.fn(),
    };
    const broker = {
      connect: jest.fn().mockResolvedValue({ channel }),
    } as unknown as MessageQueueBrokerService;
    const router = {
      dispatch: jest
        .fn()
        .mockRejectedValue(new InvalidEventPayloadError('receipt.parsed')),
    } as unknown as MessageRouter;
    const consumer = new MessageQueueConsumer(broker, router);
    const message = {
      content: Buffer.from(
        JSON.stringify({
          eventType: 'receipt.parsed',
          correlationId: 'correlation-123',
        }),
      ),
    };

    await consumer.onApplicationBootstrap();
    const handler = getConsumeHandler(consume);
    await handler(message);

    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
  });

  it('acknowledges a message only after its handler succeeds', async () => {
    const consume = jest.fn();
    const channel = {
      consume,
      ack: jest.fn(),
      nack: jest.fn(),
    };
    const broker = {
      connect: jest.fn().mockResolvedValue({ channel }),
    } as unknown as MessageQueueBrokerService;
    const router = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    } as unknown as MessageRouter;
    const consumer = new MessageQueueConsumer(broker, router);
    const message = {
      content: Buffer.from(
        JSON.stringify({
          eventType: 'receipt.parsed',
          correlationId: 'correlation-123',
        }),
      ),
    };

    await consumer.onApplicationBootstrap();
    const handler = getConsumeHandler(consume);
    await handler(message);

    expect(router.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'receipt.parsed' }),
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
  });
});
