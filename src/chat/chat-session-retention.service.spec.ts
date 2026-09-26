import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AgentService } from '../agent/agent.service';
import { ChatService } from './chat.service';
import { ChatSessionRetentionService } from './chat-session-retention.service';
import { ChatSession } from './entities/chat-session.entity';
import { ChatSessionRepository } from './repositories/chat-session.repository';

describe('Chat session retention', () => {
  it('deletes sessions that have been inactive for more than 90 days', async () => {
    const dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [ChatSession],
      synchronize: true,
    });
    await dataSource.initialize();

    try {
      const sessionRepository = new ChatSessionRepository(
        dataSource.getRepository(ChatSession),
      );
      await sessionRepository.createForUser('expired-session', 'user-1');
      await dataSource.getRepository(ChatSession).update('expired-session', {
        updatedAt: new Date('2026-05-01T00:00:00.000Z'),
      });
      const agentService = {
        invoke: jest.fn().mockResolvedValue('Agent reply'),
        deleteThread: jest.fn().mockResolvedValue(undefined),
      } as unknown as AgentService;
      const retentionService = new ChatSessionRetentionService(
        sessionRepository,
        agentService,
      );
      const chatService = new ChatService(agentService, sessionRepository);

      await retentionService.deleteExpired(
        new Date('2026-09-22T00:00:00.000Z'),
      );

      await expect(
        chatService.sendMessage({
          message: 'Continue',
          sessionId: 'expired-session',
          userId: 'user-1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      await dataSource.destroy();
    }
  });
});
