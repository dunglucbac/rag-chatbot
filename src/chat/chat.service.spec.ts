import { DataSource } from 'typeorm';
import { ChatService } from './chat.service';
import { AgentService } from '../agent/agent.service';
import { ChatSession } from './entities/chat-session.entity';
import { ChatSessionRepository } from './repositories/chat-session.repository';

describe('ChatService', () => {
  let dataSource: DataSource;
  let mockInvoke: jest.Mock;
  let chatService: ChatService;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [ChatSession],
      synchronize: true,
    });
    await dataSource.initialize();

    mockInvoke = jest.fn();
    const agentService = { invoke: mockInvoke } as unknown as AgentService;
    const sessionRepository = new ChatSessionRepository(
      dataSource.getRepository(ChatSession),
    );
    chatService = new ChatService(agentService, sessionRepository);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('uses the returned sessionId as the thread for the first message', async () => {
    mockInvoke.mockResolvedValue('Hello! How can I help?');

    const result = await chatService.sendMessage({
      message: 'Hi there',
      userId: 'user-1',
    });

    expect(result).toHaveProperty('sessionId');
    expect(result.sessionId).toEqual(expect.any(String));
    expect(result.reply).toBe('Hello! How can I help?');
    expect(mockInvoke).toHaveBeenCalledWith(
      'user-1',
      'Hi there',
      result.sessionId,
    );
  });

  it('continues an existing session by passing sessionId as thread_id', async () => {
    mockInvoke
      .mockResolvedValueOnce('Hello!')
      .mockResolvedValueOnce('Sure, what else?');

    const firstMessage = await chatService.sendMessage({
      message: 'First question',
      userId: 'user-1',
    });

    const result = await chatService.sendMessage({
      message: 'Another question',
      sessionId: firstMessage.sessionId,
      userId: 'user-1',
    });

    expect(result.sessionId).toBe(firstMessage.sessionId);
    expect(result.reply).toBe('Sure, what else?');
    expect(mockInvoke).toHaveBeenCalledWith(
      'user-1',
      'Another question',
      firstMessage.sessionId,
    );
  });

  it('uses sessionId as userId when no userId is provided', async () => {
    mockInvoke.mockResolvedValue('Hello anonymous');

    const result = await chatService.sendMessage({
      message: 'Hello',
    });

    expect(result).toHaveProperty('sessionId');
    expect(result.reply).toBe('Hello anonymous');
    expect(mockInvoke).toHaveBeenCalledWith(
      expect.any(String),
      'Hello',
      result.sessionId,
    );
  });
});
