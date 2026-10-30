import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AgentService } from '../agent/agent.service';
import { ChatSessionRepository } from './repositories/chat-session.repository';

const RETENTION_DAYS = 90;
const RETENTION_BATCH_SIZE = 1_000;

@Injectable()
export class ChatSessionRetentionService {
  private readonly logger = new Logger(ChatSessionRetentionService.name);

  constructor(
    private readonly sessionRepository: ChatSessionRepository,
    private readonly agentService: AgentService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async deleteExpired(now = new Date()): Promise<number> {
    const cutoff = new Date(
      now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1_000,
    );
    const sessions = await this.sessionRepository.findUpdatedBefore(
      cutoff,
      RETENTION_BATCH_SIZE,
    );
    let deleted = 0;

    for (const session of sessions) {
      try {
        await this.agentService.deleteThread(session.id);
        if (
          await this.sessionRepository.deleteOwnedById(
            session.id,
            session.userId,
          )
        ) {
          deleted += 1;
        }
      } catch (error: unknown) {
        this.logger.warn(
          `Could not delete expired chat session ${session.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return deleted;
  }
}
