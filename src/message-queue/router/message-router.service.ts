import { Injectable, Logger } from '@nestjs/common';
import { EventEnvelope } from '@modules/common/common.types';
import { eventPayloadSchemas } from '@modules/common/event-payloads.schemas';
import { EventHandler } from '../message-queue.types';

export class UnknownEventTypeError extends Error {
  constructor(eventType: string) {
    super(`No handler registered for eventType=${eventType}`);
    this.name = UnknownEventTypeError.name;
  }
}

export class InvalidEventPayloadError extends Error {
  constructor(eventType: string) {
    super(`Invalid payload for eventType=${eventType}`);
    this.name = InvalidEventPayloadError.name;
  }
}

@Injectable()
export class MessageRouter {
  private readonly logger = new Logger(MessageRouter.name);
  private handlers = new Map<string, EventHandler>();

  register(eventType: string, handler: EventHandler): void {
    if (this.handlers.has(eventType)) {
      this.logger.warn(
        `Handler already registered for ${eventType}, overwriting`,
      );
    }
    this.handlers.set(eventType, handler);
  }

  async dispatch(envelope: EventEnvelope): Promise<void> {
    const handler = this.handlers.get(envelope.eventType);
    if (!handler) {
      throw new UnknownEventTypeError(envelope.eventType);
    }

    const schema =
      eventPayloadSchemas[
        envelope.eventType as keyof typeof eventPayloadSchemas
      ];
    if (schema && !schema.safeParse(envelope.payload).success) {
      throw new InvalidEventPayloadError(envelope.eventType);
    }

    await handler(envelope);
  }
}
