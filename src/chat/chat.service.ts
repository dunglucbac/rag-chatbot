import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AgentService } from '../agent/agent.service';
import { ChatSessionRepository } from './repositories/chat-session.repository';

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
  constructor(
    private readonly agentService: AgentService,
    private readonly sessionRepository: ChatSessionRepository,
  ) {}

  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const sessionId = params.sessionId ?? randomUUID();
    const userId = params.userId ?? sessionId;

    if (params.sessionId) {
      const session = await this.sessionRepository.findOwnedById(
        sessionId,
        userId,
      );
      if (!session) {
        throw new NotFoundException('Chat session not found');
      }
    } else {
      await this.sessionRepository.createForUser(sessionId, userId);
    }

    const reply = await this.agentService.invoke(
      userId,
      params.message,
      sessionId,
    );
    await this.sessionRepository.touchOwnedById(sessionId, userId);

    return { sessionId, reply };
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.sessionRepository.findOwnedById(
      sessionId,
      userId,
    );
    if (!session) {
      throw new NotFoundException('Chat session not found');
    }

    await this.agentService.deleteThread(sessionId);
    await this.sessionRepository.deleteOwnedById(sessionId, userId);
  }
}
