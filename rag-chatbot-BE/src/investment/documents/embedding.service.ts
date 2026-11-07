import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { BudgetService } from '../budget/budget.service';

const responseSchema = z.object({
  data: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      embedding: z.array(z.number().finite()).length(1536),
    }),
  ),
  usage: z.object({ total_tokens: z.number().int().nonnegative() }),
});
const million = 1_000_000n;
const cost = (tokens: bigint, rate: bigint) =>
  (tokens * rate + million - 1n) / million;

@Injectable()
export class InvestmentEmbeddingService {
  constructor(
    private readonly config: ConfigService,
    private readonly budget: BudgetService,
  ) {}

  assertConfigured() {
    const key = this.config.get<string>('llm.openaiApiKey');
    const configuredRate = this.config.get<string>('investment.embeddingRate');
    if (
      !key ||
      !configuredRate ||
      !/^\d{1,12}$/.test(configuredRate) ||
      BigInt(configuredRate) === 0n
    )
      throw new ServiceUnavailableException(
        'Investment embeddings require an API key and configured rate',
      );
    return { key, configuredRate };
  }

  async embed(userId: string, inputs: string[]): Promise<number[][]> {
    const { key, configuredRate } = this.assertConfigured();
    if (
      !inputs.length ||
      inputs.length > 2048 ||
      inputs.some((text) => !text.trim())
    )
      throw new ConflictException('Invalid embedding input');
    const upperTokens = inputs.reduce(
      (sum, text) => sum + Buffer.byteLength(text, 'utf8') * 2 + 8,
      0,
    );
    if (
      upperTokens > 300000 ||
      inputs.some((text) => Buffer.byteLength(text, 'utf8') * 2 + 8 > 8192)
    )
      throw new ConflictException(
        'Document is too large to index in one request',
      );
    const rate = BigInt(configuredRate);
    const estimate = cost(BigInt(upperTokens), rate) || 1n;
    const id = randomUUID();
    const reservation = await this.budget.reserve(
      userId,
      id,
      estimate.toString(),
    );
    if (!reservation.created)
      throw new ConflictException('Embedding request is already reserved');
    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: inputs,
          encoding_format: 'float',
        }),
        signal: AbortSignal.timeout(90000),
        redirect: 'error',
      });
    } catch {
      throw new ServiceUnavailableException(
        'Embedding request failed; its cost reservation remains pending',
      );
    }
    if (!response.ok)
      throw new ServiceUnavailableException(
        'Embedding request failed; its cost reservation remains pending',
      );
    let result: z.infer<typeof responseSchema>;
    try {
      result = responseSchema.parse(await response.json());
    } catch {
      throw new ServiceUnavailableException(
        'Embedding response was invalid; its cost reservation remains pending',
      );
    }
    const actual = cost(BigInt(result.usage.total_tokens), rate);
    await this.budget.finish(userId, id, actual.toString());
    if (
      result.data.length !== inputs.length ||
      new Set(result.data.map((item) => item.index)).size !== inputs.length ||
      result.data.some((item) => item.index >= inputs.length)
    )
      throw new ServiceUnavailableException(
        'Embedding response had invalid indexes',
      );
    return [...result.data]
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
  }
}
