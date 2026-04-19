import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WebSearchService } from '../web-search/web-search.service';
import { VectorStoreService } from '../vector-store/vector-store.service';
import { Document } from '@langchain/core/documents';
import axios from 'axios';
import * as cheerio from 'cheerio';

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);

  constructor(
    private readonly webSearchService: WebSearchService,
    private readonly vectorStoreService: VectorStoreService,
  ) {}

  @Cron('0 */6 * * *')
  async scrapeAndEmbed() {
    const unscraped = await this.webSearchService.getUnscraped();
    if (!unscraped.length) return;

    this.logger.log(`Scraping ${unscraped.length} URLs...`);

    for (const log of unscraped) {
      try {
        const { data } = await axios.get(log.url, { timeout: 10000 });
        const $ = cheerio.load(data);
        $('script, style, nav, footer').remove();
        const content = $('body').text().replace(/\s+/g, ' ').trim();

        if (content.length > 100) {
          await this.vectorStoreService.addDocuments([
            new Document({
              pageContent: content.slice(0, 8000), // cap to avoid huge chunks
              metadata: { source: log.url, type: 'web' },
            }),
          ]);
        }

        await this.webSearchService.markScraped(log.id);
        this.logger.log(`Scraped: ${log.url}`);
      } catch (err) {
        this.logger.warn(`Failed to scrape ${log.url}: ${(err as Error).message}`);
      }
    }
  }
}
