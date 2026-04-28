declare module 'amqplib' {
  export interface Options {
    contentType?: string;
    messageId?: string;
    timestamp?: number;
    persistent?: boolean;
  }

  export interface Channel {
    assertExchange(
      exchange: string,
      type: 'direct' | 'fanout' | 'topic' | 'headers',
      options?: { durable?: boolean },
    ): Promise<void>;
    assertQueue(queue: string, options?: { durable?: boolean }): Promise<void>;
    bindQueue(queue: string, exchange: string, pattern: string): Promise<void>;
    consume(
      queue: string,
      onMessage: (msg: ConsumeMessage | null) => void | Promise<void>,
      options?: { noAck?: boolean },
    ): Promise<void>;
    ack(message: ConsumeMessage): void;
    nack(message: ConsumeMessage, allUpTo?: boolean, requeue?: boolean): void;
    publish(
      exchange: string,
      routingKey: string,
      content: Buffer,
      options?: Options,
    ): boolean;
    close(): Promise<void>;
  }

  export interface Connection {
    createChannel(): Promise<Channel>;
    close(): Promise<void>;
  }

  export interface ConsumeMessage {
    content: Buffer;
  }

  const amqp: {
    connect(url: string): Promise<Connection>;
  };

  export default amqp;
}
