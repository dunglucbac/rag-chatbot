import {
  InvalidReceiptClassificationError,
  normalizeReceiptClassification,
} from './receipt-taxonomy';

describe('receipt taxonomy', () => {
  it('accepts a valid confident category and subcategory', () => {
    expect(
      normalizeReceiptClassification({
        category: 'food',
        subcategory: 'groceries',
        confidence: 0.82,
      }),
    ).toEqual({
      category: 'food',
      subcategory: 'groceries',
      confidence: 0.82,
      suggestedCategory: 'food',
      suggestedSubcategory: 'groceries',
    });
  });

  it('reports low-confidence classifications as unknown while retaining the suggestion', () => {
    expect(
      normalizeReceiptClassification({
        category: 'food',
        subcategory: 'groceries',
        confidence: 0.69,
      }),
    ).toEqual({
      category: 'unknown',
      subcategory: null,
      confidence: 0.69,
      suggestedCategory: 'food',
      suggestedSubcategory: 'groceries',
    });
  });

  it('rejects a subcategory outside its category', () => {
    expect(() =>
      normalizeReceiptClassification({
        category: 'food',
        subcategory: 'fuel',
        confidence: 0.9,
      }),
    ).toThrow(InvalidReceiptClassificationError);
  });
});
