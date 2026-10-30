export const MAX_RECEIPT_TOOL_CALLS = 5;

export class ToolCallBudget {
  private callCount = 0;

  constructor(readonly limit: number) {}

  get used(): number {
    return this.callCount;
  }

  tryConsume(): boolean {
    if (this.callCount >= this.limit) {
      return false;
    }
    this.callCount += 1;
    return true;
  }
}
