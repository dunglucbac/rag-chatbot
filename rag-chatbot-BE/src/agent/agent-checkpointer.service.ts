import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

@Injectable()
export class AgentCheckpointerService implements OnModuleInit, OnModuleDestroy {
  readonly checkpointer: PostgresSaver;

  constructor(config: ConfigService) {
    this.checkpointer = PostgresSaver.fromConnString(
      this.connectionString(config),
    );
  }

  async onModuleInit(): Promise<void> {
    await this.checkpointer.setup();
  }

  async onModuleDestroy(): Promise<void> {
    await this.checkpointer.end();
  }

  private connectionString(config: ConfigService): string {
    const host = this.required(config, 'db.host');
    const port = config.get<number>('db.port') ?? 5432;
    const user = this.required(config, 'db.user');
    const password = this.required(config, 'db.pass');
    const database = this.required(config, 'db.name');
    const hostname = host.includes(':') ? `[${host}]` : host;
    const ssl = config.get<string>('db.ssl') === 'true';

    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${hostname}:${port}/${encodeURIComponent(database)}${ssl ? '?sslmode=no-verify' : ''}`;
  }

  private required(config: ConfigService, key: string): string {
    const value = config.get<string>(key)?.trim();
    if (!value) {
      throw new ServiceUnavailableException(
        `Missing required checkpointer configuration: ${key}`,
      );
    }
    return value;
  }
}
