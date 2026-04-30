import { MessageQueueBrokerService } from '@modules/message-queue/broker/broker.service';
import { MESSAGE_QUEUE_BINDINGS } from '@modules/message-queue/message-queue.constants';
import { MessageQueueTransportService } from './transport.service';
import { MessageQueueConsumer } from './consumer.service';

describe('MessageQueueConsumer', () => {
  it('consumes configured queues using the broker channel', async () => {
    const consume = jest.fn();
    const channel = {
      assertQueue: jest.fn().mockResolvedValue(undefined),
      bindQueue: jest.fn().mockResolvedValue(undefined),
      consume,
    };
    const broker = {
      connect: jest.fn().mockResolvedValue({ channel }),
    } as unknown as MessageQueueBrokerService;
    const transport = {
      handleMessage: jest.fn(),
    } as unknown as MessageQueueTransportService;

    const consumer = new MessageQueueConsumer(broker, transport);
    await consumer.onModuleInit();

    expect(channel.consume).toHaveBeenCalledTimes(
      MESSAGE_QUEUE_BINDINGS.length,
    );
  });
});
