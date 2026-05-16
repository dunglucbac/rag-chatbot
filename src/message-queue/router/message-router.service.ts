import { Injectable, Logger } from '@nestjs/common';
import { EventEnvelope } from '@modules/common/common.types';
import { EventHandler } from '../message-queue.types';

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
      this.logger.warn(
        `No handler registered for eventType=${envelope.eventType}`,
      );
      return;
    }
    await handler(envelope);
  }
}
