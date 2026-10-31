import { ToolCallBudget } from './tool-call-budget';

describe('ToolCallBudget', () => {
  it('allows five calls and rejects later attempts', () => {
    const budget = new ToolCallBudget(5);

    expect(Array.from({ length: 5 }, () => budget.tryConsume())).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(budget.tryConsume()).toBe(false);
    expect(budget.used).toBe(5);
  });
});
