import { Module } from '@nestjs/common';
import { VectorStoreService } from './vector-store.service';
import { VectorStoreConsumer } from './vector-store.consumer';

@Module({
  providers: [VectorStoreService, VectorStoreConsumer],
  exports: [VectorStoreService],
})
export class VectorStoreModule {}
