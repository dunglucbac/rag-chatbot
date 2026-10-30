export const RECEIPT_TAXONOMY_VERSION = 'v1';
export const RECEIPT_CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.7;

export const RECEIPT_TAXONOMY: Record<string, readonly string[]> = {
  food: ['groceries', 'dining'],
  housing: ['rent', 'utilities', 'maintenance'],
  transport: ['fuel', 'public transit', 'ride hailing', 'parking'],
  health: ['medical', 'pharmacy', 'fitness'],
  education: [],
  entertainment: ['subscriptions', 'events', 'games'],
  shopping: ['clothing', 'electronics', 'household', 'general'],
  travel: [],
  'personal care': [],
  fees: [],
  'gifts and donations': [],
  other: [],
  unknown: [],
};

export class InvalidReceiptClassificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidReceiptClassificationError';
  }
}

export interface ReceiptClassificationInput {
  category: string;
  subcategory: string | null;
  confidence: number;
}

export interface NormalizedReceiptClassification {
  category: string;
  subcategory: string | null;
  confidence: number;
  suggestedCategory: string;
  suggestedSubcategory: string | null;
}

export function normalizeReceiptClassification(
  input: ReceiptClassificationInput,
): NormalizedReceiptClassification {
  const category = normalizeValue(input.category);
  const subcategory = input.subcategory
    ? normalizeValue(input.subcategory)
    : null;
  if (!(category in RECEIPT_TAXONOMY)) {
    throw new InvalidReceiptClassificationError('Unknown receipt category');
  }
  const allowedSubcategories = RECEIPT_TAXONOMY[category];
  if (
    (allowedSubcategories.length === 0 && subcategory !== null) ||
    (subcategory !== null && !allowedSubcategories.includes(subcategory))
  ) {
    throw new InvalidReceiptClassificationError(
      'Receipt subcategory is not valid for its category',
    );
  }
  if (
    !Number.isFinite(input.confidence) ||
    input.confidence < 0 ||
    input.confidence > 1
  ) {
    throw new InvalidReceiptClassificationError(
      'Receipt classification confidence must be between zero and one',
    );
  }

  const isConfident =
    category !== 'unknown' &&
    input.confidence >= RECEIPT_CLASSIFICATION_CONFIDENCE_THRESHOLD;
  return {
    category: isConfident ? category : 'unknown',
    subcategory: isConfident ? subcategory : null,
    confidence: input.confidence,
    suggestedCategory: category,
    suggestedSubcategory: subcategory,
  };
}

function normalizeValue(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}
