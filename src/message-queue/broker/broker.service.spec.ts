import { ConfigService } from '@nestjs/config';
import amqp from 'amqplib';
import { MESSAGE_QUEUE_BINDINGS } from '@modules/message-queue/message-queue.constants';
import { MessageQueueBrokerService } from './broker.service';

jest.mock('amqplib', () => ({
  __esModule: true,
  default: {
    connect: jest.fn(),
  },
}));

type MockedAmqpModule = {
  default: { connect: jest.MockedFunction<typeof amqp.connect> };
};

const getConnectMock = (): jest.MockedFunction<typeof amqp.connect> => {
  const mockedAmqpModule = jest.requireMock<MockedAmqpModule>('amqplib');
  return mockedAmqpModule.default.connect;
};

describe('MessageQueueBrokerService', () => {
  const connectMock = getConnectMock();
  const configService = {
    get: jest.fn(),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    connectMock.mockReset();
    (configService.get as jest.Mock).mockImplementation(
      (key: string, fallback: string) => {
        if (key === 'rabbitmq.url') return 'amqp://broker';
        if (key === 'rabbitmq.exchange') return 'custom.exchange';
        return fallback;
      },
    );
  });

  it('initializes RabbitMQ once and declares the shared topology', async () => {
    const publish = jest.fn().mockReturnValue(true);
    const close = jest.fn().mockResolvedValue(undefined);
    const consume = jest.fn();
    const ack = jest.fn();
    const nack = jest.fn();
    const channel = {
      assertExchange: jest.fn().mockResolvedValue(undefined),
      assertQueue: jest.fn().mockResolvedValue(undefined),
      bindQueue: jest.fn().mockResolvedValue(undefined),
      publish,
      close,
      consume,
      ack,
      nack,
    };
    const connection = {
      createChannel: jest.fn().mockResolvedValue(channel),
      close: jest.fn().mockResolvedValue(undefined),
    };

    connectMock.mockResolvedValue(connection as never);

    const broker = new MessageQueueBrokerService(configService);
    await broker.connect();
    await broker.connect();

    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(connectMock).toHaveBeenCalledWith('amqp://broker');
    expect(connection.createChannel).toHaveBeenCalledTimes(1);
    expect(channel.assertExchange).toHaveBeenCalledWith(
      'custom.exchange',
      'topic',
      {
        durable: true,
      },
    );
    expect(channel.assertQueue).toHaveBeenCalledTimes(
      MESSAGE_QUEUE_BINDINGS.length,
    );
    expect(channel.bindQueue).toHaveBeenCalledTimes(
      MESSAGE_QUEUE_BINDINGS.length,
    );
  });

  it('closes channel and connection during shutdown', async () => {
    const channel = {
      assertExchange: jest.fn().mockResolvedValue(undefined),
      assertQueue: jest.fn().mockResolvedValue(undefined),
      bindQueue: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const connection = {
      createChannel: jest.fn().mockResolvedValue(channel),
      close: jest.fn().mockResolvedValue(undefined),
    };

    connectMock.mockResolvedValue(connection as never);

    const broker = new MessageQueueBrokerService(configService);
    await broker.connect();
    await broker.close();

    expect(channel.close).toHaveBeenCalledTimes(1);
    expect(connection.close).toHaveBeenCalledTimes(1);
  });
});
