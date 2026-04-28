import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DispatchEnvelope } from '@modules/common/common.types';

@Injectable()
export class CommonDispatchService {
  dispatch<TPayload extends Record<string, unknown>>(
    eventType: string,
    payload?: TPayload,
  ): DispatchEnvelope<TPayload> {
    return {
      eventId: randomUUID(),
      eventType,
      createdAt: new Date().toISOString(),
      payload,
    };
  }
}
