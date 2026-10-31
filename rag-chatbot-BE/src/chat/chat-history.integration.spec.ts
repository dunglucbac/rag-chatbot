import { DataSource, EntitySchema } from 'typeorm';
import { ChatService } from './chat.service';
import { ChatSessionRepository } from './repositories/chat-session.repository';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { IngestionJob } from '../ingestion/entities/ingestion-job.entity';
import { AgentService } from '../agent/agent.service';

describe('UI conversation history', () => {
  let ds: DataSource;
  let service: ChatService;
  beforeEach(async () => {
    ds = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      entities: [
        ChatSession,
        ChatMessage,
        new EntitySchema({
          name: 'IngestionJob',
          target: IngestionJob,
          tableName: 'ingestion_jobs',
          columns: {
            id: { type: String, primary: true },
            userId: { type: String, name: 'user_id' },
            originalFilename: { type: String, name: 'original_filename' },
          },
        }),
      ],
    }).initialize();
    service = new ChatService(
      {
        invoke: jest.fn().mockResolvedValue('Your spending summary'),
        deleteThread: jest.fn(),
      } as unknown as AgentService,
      new ChatSessionRepository(ds.getRepository(ChatSession)),
    );
  });
  afterEach(() => ds.destroy());

  it('saves only public conversation text and keeps account history isolated', async () => {
    const result = await service.sendMessage({
      userId: 'owner',
      message: 'Show my spending',
    });
    const history = await service.getSession('owner', result.sessionId);
    expect(history.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'Show my spending'],
      ['assistant', 'Your spending summary'],
    ]);
    expect(history.session.title).toBe('Show my spending');
    expect((await service.listSessions('other', 0)).sessions).toHaveLength(0);
    await expect(service.getSession('other', result.sessionId)).rejects.toThrow(
      'not found',
    );
    await service.deleteSession('owner', result.sessionId);
    expect(await ds.getRepository(ChatMessage).count()).toBe(0);
  });

  it('attaches an owned upload idempotently and rejects cross-account resources', async () => {
    const session = await service.createSession('owner');
    await ds.getRepository(IngestionJob).save([
      { id: 'job', userId: 'owner', originalFilename: 'receipt.png' },
      { id: 'private-job', userId: 'other', originalFilename: 'private.png' },
    ]);
    const first = await service.attachUpload('owner', session.id, 'job');
    const second = await service.attachUpload('owner', session.id, 'job');
    expect(first.id).toBe(second.id);
    expect(
      (await service.getSession('owner', session.id)).messages,
    ).toHaveLength(1);
    await expect(
      service.attachUpload('owner', session.id, 'private-job'),
    ).rejects.toThrow('not found');
    await expect(
      service.attachUpload('other', session.id, 'job'),
    ).rejects.toThrow('not found');
  });

  it('pages older messages without skipping or duplicating entries', async () => {
    const session = await service.createSession('owner');
    await ds.getRepository(ChatMessage).save(
      Array.from({ length: 103 }, (_, i) => ({
        sessionId: session.id,
        role: 'user' as const,
        content: String(i),
      })),
    );
    const latest = await service.getSession('owner', session.id);
    expect(latest.messages).toHaveLength(100);
    expect(latest.messages[0].content).toBe('3');
    const earlier = await service.getSession(
      'owner',
      session.id,
      latest.nextBefore!,
    );
    expect(earlier.messages.map((m) => m.content)).toEqual(['0', '1', '2']);
    expect(earlier.nextBefore).toBeNull();
  });
});
