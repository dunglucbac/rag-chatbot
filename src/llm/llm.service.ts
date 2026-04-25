import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

@Injectable()
export class LlmService {
  constructor(private readonly config: ConfigService) {}

  getModel(): BaseChatModel {
    const provider = this.config.get<string>('llm.provider');
    if (provider === 'openai') {
      return new ChatOpenAI({
        model: 'gpt-4o',
        apiKey: this.config.get<string>('llm.openaiApiKey'),
      });
    }

    return new ChatAnthropic({
      model: 'claude-sonnet-4-6',
      apiKey: this.config.get<string>('llm.anthropicApiKey'),
      clientOptions: {
        baseURL: this.config.get<string>('llm.anthropicBaseUrl'),
      },
    });
  }
}
