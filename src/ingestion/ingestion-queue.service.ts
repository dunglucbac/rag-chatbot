import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { IngestionQueuePayload } from './ingestion.types';

@Injectable()
export class IngestionQueueService {
  private readonly redis: Redis;
  private readonly streamName = 'ingestion_jobs';

  constructor(private readonly config: ConfigService) {
    this.redis = new Redis({
      host: this.config.get<string>('redis.host') ?? 'localhost',
      port: this.config.get<number>('redis.port') ?? 6379,
      password: this.config.get<string>('redis.password') ?? undefined,
    });
  }

  async enqueue(payload: IngestionQueuePayload) {
    await this.redis.xadd(
      this.streamName,
      '*',
      'jobId',
      payload.jobId,
      'storagePath',
      payload.storagePath,
      'mimeType',
      payload.mimeType,
      'originalFilename',
      payload.originalFilename,
      'sourceType',
      payload.sourceType,
    );
  }
}
