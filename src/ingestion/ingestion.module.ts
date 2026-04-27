import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { VectorStoreModule } from '../vector-store/vector-store.module';
import { IngestionJob } from './entities/ingestion-job.entity';
import { IngestionJobService } from './ingestion-job.service';

@Module({
  imports: [TypeOrmModule.forFeature([IngestionJob]), VectorStoreModule],
  controllers: [IngestionController],
  providers: [IngestionService, IngestionJobService],
  exports: [IngestionJobService],
})
export class IngestionModule {}
