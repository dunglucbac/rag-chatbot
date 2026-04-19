import { Module } from '@nestjs/common';
import { ScraperService } from './scraper.service';
import { WebSearchModule } from '../web-search/web-search.module';
import { VectorStoreModule } from '../vector-store/vector-store.module';

@Module({
  imports: [WebSearchModule, VectorStoreModule],
  providers: [ScraperService],
})
export class ScraperModule {}
