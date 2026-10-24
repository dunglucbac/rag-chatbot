import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LangfuseClient } from '@langfuse/client';
import { CallbackHandler } from '@langfuse/langchain';
import { propagateAttributes, startActiveObservation } from '@langfuse/tracing';

export interface ChatTraceContext {
  message: string;
  sessionId: string;
  userId: string;
}

export interface ChatTraceOutcome {
  reply: string;
  metadata: Record<string, unknown>;
}

@Injectable()
export class LangfuseObservabilityService implements OnApplicationShutdown {
  private readonly logger = new Logger(LangfuseObservabilityService.name);
  private readonly client?: LangfuseClient;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const enabled =
      this.config.get<boolean>('langfuse.tracingEnabled') === true;
    const publicKey = this.config.get<string>('langfuse.publicKey');
    const secretKey = this.config.get<string>('langfuse.secretKey');
    const baseUrl = this.config.get<string>('langfuse.baseUrl');
    const runtimeEnvironment = process.env.NODE_ENV;

    this.enabled =
      enabled &&
      (runtimeEnvironment === 'development' || runtimeEnvironment === 'test') &&
      Boolean(publicKey && secretKey);

    if (this.enabled && publicKey && secretKey) {
      this.client = new LangfuseClient({ publicKey, secretKey, baseUrl });
    }
  }

  async traceChat(
    context: ChatTraceContext,
    operation: (handler?: CallbackHandler) => Promise<ChatTraceOutcome>,
  ): Promise<ChatTraceOutcome> {
    if (!this.enabled || !this.client) {
      return operation();
    }

    const handler = new CallbackHandler({
      sessionId: context.sessionId,
      userId: context.userId,
      tags: ['chat', process.env.NODE_ENV === 'test' ? 'test' : 'development'],
    });

    let traceUrl: string | undefined;
    let operationStarted = false;
    let operationOutcome: ChatTraceOutcome | undefined;
    let operationCompleted = false;
    try {
      return await startActiveObservation(
        'chat-response',
        async (observation) => {
          observation.update({ input: { message: context.message } });
          const environment =
            process.env.NODE_ENV === 'test' ? 'test' : 'development';

          const outcome = await propagateAttributes(
            {
              sessionId: context.sessionId,
              userId: context.userId,
              traceName: 'chat-response',
              tags: ['chat', environment],
              environment,
            },
            () => {
              operationStarted = true;
              return operation(handler);
            },
          );
          operationOutcome = outcome;
          operationCompleted = true;

          observation.update({
            output: { reply: outcome.reply },
            metadata: outcome.metadata,
          });
          try {
            traceUrl = await this.client!.getTraceUrl(observation.traceId);
          } catch (error: unknown) {
            this.logger.warn(
              `Could not resolve Langfuse trace URL: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
          return outcome;
        },
        { asType: 'agent' },
      );
    } catch (error: unknown) {
      if (operationCompleted && operationOutcome) {
        this.logger.warn(
          `Langfuse tracing failed after chat completed; returning the chat reply: ${error instanceof Error ? error.message : String(error)}`,
        );
        return operationOutcome;
      }
      if (!operationStarted) {
        this.logger.warn(
          `Langfuse tracing could not start; continuing without tracing: ${error instanceof Error ? error.message : String(error)}`,
        );
        return operation();
      }
      throw error;
    } finally {
      if (traceUrl) {
        this.logger.log(`Langfuse trace: ${traceUrl}`);
      } else if (handler.last_trace_id) {
        this.logger.warn(
          `Langfuse trace recorded with id ${handler.last_trace_id}, but its URL could not be resolved`,
        );
      }
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client?.shutdown();
  }
}
