import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AgentService } from '../agent/agent.service';
import { ChatService } from './chat.service';
import { ChatSession } from './entities/chat-session.entity';
import { ChatSessionRepository } from './repositories/chat-session.repository';

describe('Chat session ownership', () => {
  let dataSource: DataSource;
  let chatService: ChatService;
  let deleteThread: jest.Mock;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [ChatSession],
      synchronize: true,
    });
    await dataSource.initialize();

    deleteThread = jest.fn().mockResolvedValue(undefined);
    const agentService = {
      invoke: jest.fn().mockResolvedValue('Agent reply'),
      deleteThread,
    } as unknown as AgentService;
    const sessionRepository = new ChatSessionRepository(
      dataSource.getRepository(ChatSession),
    );
    chatService = new ChatService(agentService, sessionRepository);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it("prevents a user from continuing another user's session", async () => {
    const firstMessage = await chatService.sendMessage({
      message: 'Show my receipts',
      userId: 'user-1',
    });

    await expect(
      chatService.sendMessage({
        message: 'Continue that conversation',
        sessionId: firstMessage.sessionId,
        userId: 'user-2',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes an owned session and its conversation history', async () => {
    const firstMessage = await chatService.sendMessage({
      message: 'Show my receipts',
      userId: 'user-1',
    });

    await chatService.deleteSession('user-1', firstMessage.sessionId);

    expect(deleteThread).toHaveBeenCalledWith(firstMessage.sessionId);
    await expect(
      chatService.sendMessage({
        message: 'Continue that conversation',
        sessionId: firstMessage.sessionId,
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
