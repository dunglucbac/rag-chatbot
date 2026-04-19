import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { WebSearchLog } from './entities/web-search-log.entity';

interface TavilyResult {
  url: string;
  content: string;
}

@Injectable()
export class WebSearchService {
  constructor(
    @InjectRepository(WebSearchLog)
    private readonly repo: Repository<WebSearchLog>,
    private readonly config: ConfigService,
  ) {}

  async search(query: string, userId: string): Promise<string> {
    const { data } = await axios.post<{ results: TavilyResult[] }>(
      'https://api.tavily.com/search',
      { query, max_results: 3 },
      { headers: { Authorization: `Bearer ${this.config.get<string>('tavily.apiKey')}` } },
    );
    const results = data.results ?? [];

    // Log each URL for later scraping
    await Promise.all(
      results.map((r) =>
        this.repo.save({ userId, query, url: r.url, scraped: false }),
      ),
    );

    const formatted = results
      .map((r, i) => `[${i + 1}] ${r.url}\n${r.content}`)
      .join('\n\n');

    return `⚠️ I searched the web for this answer.\n\n${formatted}`;
  }

  async getUnscraped(): Promise<WebSearchLog[]> {
    return this.repo.find({ where: { scraped: false } });
  }

  async markScraped(id: string) {
    await this.repo.update(id, { scraped: true });
  }
}
