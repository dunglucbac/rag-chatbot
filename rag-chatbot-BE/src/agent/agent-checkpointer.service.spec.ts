import { ConfigService } from '@nestjs/config';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { AgentCheckpointerService } from './agent-checkpointer.service';

describe('AgentCheckpointerService', () => {
  it('initializes and closes the PostgreSQL checkpointer with the app lifecycle', async () => {
    const setup = jest.fn().mockResolvedValue(undefined);
    const end = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(PostgresSaver, 'fromConnString').mockReturnValue({
      setup,
      end,
    } as unknown as PostgresSaver);
    const values: Record<string, string | number> = {
      'db.host': 'localhost',
      'db.port': 5432,
      'db.user': 'app-user',
      'db.pass': 'secret',
      'db.name': 'receipts',
      'db.ssl': 'false',
    };
    const config = {
      get: (key: string) => values[key],
    } as ConfigService;

    const service = new AgentCheckpointerService(config);
    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(setup).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
  });
});
