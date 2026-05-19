import { ChatService } from './chat.service';
import { AgentService } from '../agent/agent.service';

describe('ChatService', () => {
  it('returns sessionId and reply on first message (implicit session creation)', async () => {
    const mockInvoke = jest.fn().mockResolvedValue('Hello! How can I help?');
    const agentService = { invoke: mockInvoke } as unknown as AgentService;
    const chatService = new ChatService(agentService);

    const result = await chatService.sendMessage({
      message: 'Hi there',
      userId: 'user-1',
    });

    expect(result).toHaveProperty('sessionId');
    expect(result.sessionId).toEqual(expect.any(String));
    expect(result.reply).toBe('Hello! How can I help?');
    expect(mockInvoke).toHaveBeenCalledWith('user-1', 'Hi there', undefined);
  });

  it('continues an existing session by passing sessionId as thread_id', async () => {
    const mockInvoke = jest.fn().mockResolvedValue('Sure, what else?');
    const agentService = { invoke: mockInvoke } as unknown as AgentService;
    const chatService = new ChatService(agentService);

    const result = await chatService.sendMessage({
      message: 'Another question',
      sessionId: 'session-abc',
      userId: 'user-1',
    });

    expect(result.sessionId).toBe('session-abc');
    expect(result.reply).toBe('Sure, what else?');
    expect(mockInvoke).toHaveBeenCalledWith('user-1', 'Another question', 'session-abc');
  });

  it('uses sessionId as userId when no userId is provided', async () => {
    const mockInvoke = jest.fn().mockResolvedValue('Hello anonymous');
    const agentService = { invoke: mockInvoke } as unknown as AgentService;
    const chatService = new ChatService(agentService);

    const result = await chatService.sendMessage({
      message: 'Hello',
    });

    expect(result).toHaveProperty('sessionId');
    expect(result.reply).toBe('Hello anonymous');
    expect(mockInvoke).toHaveBeenCalledWith(
      expect.any(String),
      'Hello',
      undefined,
    );
  });
});
