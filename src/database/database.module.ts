import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { IngestionJob } from '@modules/ingestion/entities/ingestion-job.entity';
import { WebSearchLog } from '@modules/web-search/entities/web-search-log.entity';
import { Message } from '@modules/conversation/entities/message.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const sslEnabled = configService.get('db.ssl') === 'true';

        return {
          type: 'postgres',
          host: configService.get('db.host'),
          port: configService.get('db.port'),
          username: configService.get('db.user'),
          password: configService.get('db.pass'),
          database: configService.get('db.name'),
          entities: [IngestionJob, WebSearchLog, Message],
          synchronize: false,
          logging: false,
          ssl: sslEnabled ? { rejectUnauthorized: false } : false,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
