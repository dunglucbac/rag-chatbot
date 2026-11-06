import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { z } from 'zod';
import { LlmService } from '../../llm/llm.service';
import { BudgetService } from './budget.service';

const usage = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
});
const limit = (tokens: bigint, rate: bigint) =>
  (tokens * rate + 999_999n) / 1_000_000n;
function rate(value?: string): bigint {
  if (!value || !/^\d{1,12}$/.test(value) || BigInt(value) === 0n)
    throw new ServiceUnavailableException(
      'Investment model pricing is not configured',
    );
  return BigInt(value);
}

@Injectable()
export class BudgetedModelService {
  constructor(
    private readonly config: ConfigService,
    private readonly llm: LlmService,
    private readonly budget: BudgetService,
  ) {}

  async invoke(
    userId: string,
    requestId: string,
    system: string,
    prompt: string,
    maxTokens = 1200,
  ) {
    if (
      !system.trim() ||
      !prompt.trim() ||
      system.length > 10000 ||
      prompt.length > 120000 ||
      !Number.isInteger(maxTokens) ||
      maxTokens < 1 ||
      maxTokens > 2048
    )
      throw new ConflictException('Invalid investment model request');
    const inputRate = rate(this.config.get<string>('investment.inputRate'));
    const outputRate = rate(this.config.get<string>('investment.outputRate'));
    const upperInput = BigInt(
      (Buffer.byteLength(system, 'utf8') + Buffer.byteLength(prompt, 'utf8')) *
        2 +
        1024,
    );
    const estimate =
      limit(upperInput, inputRate) + limit(BigInt(maxTokens), outputRate);
    const reservation = await this.budget.reserve(
      userId,
      requestId,
      (estimate || 1n).toString(),
    );
    if (!reservation.created)
      throw new ConflictException('Investment model request already reserved');
    let response: AIMessage;
    try {
      response = await this.llm
        .getModel({ maxTokens, maxRetries: 0 })
        .invoke([new SystemMessage(system), new HumanMessage(prompt)]);
    } catch {
      throw new ServiceUnavailableException(
        'Investment model request failed; its cost reservation remains pending',
      );
    }
    const measured = usage.safeParse(response.usage_metadata);
    if (!measured.success)
      throw new ServiceUnavailableException(
        'Model usage was unavailable; its cost reservation remains pending',
      );
    const actual =
      limit(BigInt(measured.data.input_tokens), inputRate) +
      limit(BigInt(measured.data.output_tokens), outputRate);
    await this.budget.finish(userId, requestId, actual.toString());
    const text =
      typeof response.content === 'string'
        ? response.content
        : response.content
            .filter(
              (part) => part.type === 'text' && typeof part.text === 'string',
            )
            .map((part) => part.text)
            .join('\n');
    if (!text.trim())
      throw new ServiceUnavailableException(
        'Investment model returned no text',
      );
    return {
      text,
      inputTokens: measured.data.input_tokens,
      outputTokens: measured.data.output_tokens,
      costMicros: actual.toString(),
    };
  }
}
