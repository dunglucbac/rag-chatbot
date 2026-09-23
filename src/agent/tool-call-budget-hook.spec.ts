import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { enforceToolCallBudget } from './tool-call-budget-hook';

describe('enforceToolCallBudget', () => {
  it('replaces a sixth tool request with a final narrowing response', () => {
    const messages = [
      new HumanMessage('Show me my purchases'),
      ...Array.from(
        { length: 5 },
        (_, index) =>
          new ToolMessage({
            content: '{"status":"success"}',
            tool_call_id: `tool-${index}`,
            name: 'get_purchase_summary',
          }),
      ),
      new AIMessage({
        content: '',
        tool_calls: [
          {
            id: 'tool-6',
            name: 'search_purchase_items',
            args: { rangeType: 'relative', period: 'last_week' },
            type: 'tool_call',
          },
        ],
      }),
    ];

    const update = enforceToolCallBudget({ messages });

    expect(update.messages).toHaveLength(1);
    expect(update.messages?.[0].content).toBe(
      'I have reached the receipt lookup limit for this question. Please narrow the date range or filters.',
    );
  });

  it('permits a fifth tool request', () => {
    const messages = [
      new HumanMessage('Show me my purchases'),
      ...Array.from(
        { length: 4 },
        (_, index) =>
          new ToolMessage({
            content: '{"status":"success"}',
            tool_call_id: `tool-${index}`,
            name: 'get_purchase_summary',
          }),
      ),
      new AIMessage({
        content: '',
        tool_calls: [
          {
            id: 'tool-5',
            name: 'search_purchase_items',
            args: { rangeType: 'relative', period: 'last_week' },
            type: 'tool_call',
          },
        ],
      }),
    ];

    expect(enforceToolCallBudget({ messages })).toEqual({});
  });
});
