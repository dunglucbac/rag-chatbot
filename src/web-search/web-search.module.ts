import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebSearchService } from './web-search.service';
import { WebSearchLog } from './entities/web-search-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WebSearchLog])],
  providers: [WebSearchService],
  exports: [WebSearchService],
})
export class WebSearchModule {}
