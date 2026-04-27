import type { WebSearchLog } from '../entities/web-search-log.entity';

export class WebSearchLogDto {
  declare id: string;
  declare userId: string;
  declare query: string;
  declare url: string;
  declare scraped: boolean;
  declare timestamp: Date;

  static fromEntity(entity: WebSearchLog): WebSearchLogDto {
    const dto = new WebSearchLogDto();
    dto.id = entity.id;
    dto.userId = entity.userId;
    dto.query = entity.query;
    dto.url = entity.url;
    dto.scraped = entity.scraped;
    dto.timestamp = entity.timestamp;
    return dto;
  }
}
