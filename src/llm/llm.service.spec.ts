import { ConfigService } from '@nestjs/config';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { LlmService } from './llm.service';

jest.mock('@langchain/anthropic', () => ({
  ChatAnthropic: jest.fn(),
}));
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn(),
}));

describe('LlmService', () => {
  const chatAnthropic = jest.mocked(ChatAnthropic);
  const chatOpenAI = jest.mocked(ChatOpenAI);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses LLM_MODEL for OpenAI', () => {
    const service = new LlmService(config({
      'llm.provider': 'openai',
      'llm.model': 'gpt-5-mini',
      'llm.openaiApiKey': 'openai-key',
    }));

    service.getModel();

    expect(chatOpenAI).toHaveBeenCalledWith({
      model: 'gpt-5-mini',
      apiKey: 'openai-key',
    });
  });

  it('uses LLM_MODEL for Anthropic', () => {
    const service = new LlmService(config({
      'llm.provider': 'anthropic',
      'llm.model': 'claude-sonnet-5',
      'llm.anthropicApiKey': 'anthropic-key',
      'llm.anthropicBaseUrl': 'https://example.test',
    }));

    service.getModel();

    expect(chatAnthropic).toHaveBeenCalledWith({
      model: 'claude-sonnet-5',
      apiKey: 'anthropic-key',
      clientOptions: { baseURL: 'https://example.test' },
    });
  });

  it('keeps the provider defaults when LLM_MODEL is unset', () => {
    const service = new LlmService(config({
      'llm.provider': 'openai',
      'llm.openaiApiKey': 'openai-key',
    }));

    service.getModel();

    expect(chatOpenAI).toHaveBeenCalledWith({
      model: 'gpt-4o',
      apiKey: 'openai-key',
    });
  });

  function config(values: Record<string, string>): ConfigService {
    return {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;
  }
});
