import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { WebSearchService } from '../../web-search/web-search.service';

export function createWebSearchTool(webSearchService: WebSearchService, userId: string) {
  return tool(
    async ({ query }) => {
      return webSearchService.search(query, userId);
    },
    {
      name: 'search_web',
      description: 'Search the internet for up-to-date information. Only use this if the knowledge base has no relevant results.',
      schema: z.object({ query: z.string().describe('The search query') }),
    },
  );
}
