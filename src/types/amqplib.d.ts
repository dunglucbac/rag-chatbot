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

  const amqp: {
    connect(url: string): Promise<Connection>;
  };

  export default amqp;
}
