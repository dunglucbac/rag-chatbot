import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { VectorStoreService } from '../../vector-store/vector-store.service';

export function createKnowledgeBaseTool(vectorStore: VectorStoreService) {
  return tool(
    async ({ query }) => {
      const docs = await vectorStore.similaritySearch(query, 4);
      if (!docs.length) return 'No relevant information found in the knowledge base.';
      return docs.map((d) => `Source: ${d.metadata.source ?? 'unknown'}\n${d.pageContent}`).join('\n\n');
    },
    {
      name: 'search_knowledge_base',
      description: 'Search uploaded PDF documents for relevant information. Use this first before searching the web.',
      schema: z.object({ query: z.string().describe('The search query') }),
    },
  );
}
