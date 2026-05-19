import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AgentService } from '../agent/agent.service';

export interface SendMessageParams {
  message: string;
  sessionId?: string;
  userId?: string;
}

export interface SendMessageResult {
  sessionId: string;
  reply: string;
}

@Injectable()
export class ChatService {
  constructor(private readonly agentService: AgentService) {}

  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const sessionId = params.sessionId ?? randomUUID();
    const userId = params.userId ?? sessionId;

    const reply = await this.agentService.invoke(
      userId,
      params.message,
      params.sessionId,
    );

    return { sessionId, reply };
  }
}
