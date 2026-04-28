import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IngestionController } from '@modules/ingestion/ingestion.controller';
import { IngestionService } from '@modules/ingestion/ingestion.service';
import { VectorStoreModule } from '@modules/vector-store/vector-store.module';
import { IngestionJob } from '@modules/ingestion/entities/ingestion-job.entity';
import { IngestionJobRepository } from '@repositories/ingestion-job.repository';
import { CommonModule } from '@modules/common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([IngestionJob]),
    VectorStoreModule,
    CommonModule,
  ],
  controllers: [IngestionController],
  providers: [IngestionService, IngestionJobRepository],
  exports: [IngestionJobRepository],
})
export class IngestionModule {}
