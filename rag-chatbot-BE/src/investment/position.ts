import { InvestmentEvent } from './entities/investment-event.entity';

const SCALE = 10_000n;

function amount(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^\d{1,12}(?:\.\d{1,4})?$/.test(value))
    return null;
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(4, '0'));
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function format(value: bigint, divisor: bigint): string {
  const rounded = (value + divisor / 2n) / divisor;
  return `${rounded / SCALE}.${(rounded % SCALE).toString().padStart(4, '0')}`;
}

/** Chronological journal entries; a snapshot replaces prior balance and basis. */
export function calculatePosition(events: InvestmentEvent[], asOf: string) {
  let shares: bigint | null = null;
  let numerator: bigint | null = null;
  let denominator = 1n;
  const warnings = new Set<string>();
  const days = new Map<string, number>();
  for (const event of events) {
    if (!['buy', 'sell', 'position'].includes(event.type)) continue;
    if (event.occurredOn > asOf) {
      warnings.add('future_event_excluded');
      continue;
    }
    const countOnDay = (days.get(event.occurredOn) ?? 0) + 1;
    days.set(event.occurredOn, countOnDay);
    if (countOnDay > 1) warnings.add('same_day_order_assumed');
    const quantity = event.details.shares;
    if (
      typeof quantity !== 'number' ||
      !Number.isSafeInteger(quantity) ||
      quantity < 0
    ) {
      shares = null;
      numerator = null;
      warnings.add('invalid_event');
      continue;
    }
    const count = BigInt(quantity);
    if (event.type === 'position') {
      warnings.delete('unmatched_sale');
      warnings.delete('invalid_event');
      warnings.delete('purchase_fees_not_provided');
      shares = count;
      const cost = amount(event.details.averageCostVnd);
      numerator = shares === 0n ? 0n : cost === null ? null : cost * shares;
      denominator = 1n;
      continue;
    }
    if (event.type === 'buy') {
      const price = amount(event.details.priceVnd);
      const fee = amount(event.details.feesVnd);
      if (event.details.feesVnd === undefined)
        warnings.add('purchase_fees_not_provided');
      if (
        price === null ||
        count === 0n ||
        (event.details.feesVnd !== undefined && fee === null)
      ) {
        shares = null;
        numerator = null;
        warnings.add('invalid_event');
        continue;
      }
      if (shares === null) {
        if (warnings.has('unmatched_sale') || warnings.has('invalid_event'))
          continue;
        shares = 0n;
        numerator = 0n;
      }
      shares += count;
      if (numerator !== null)
        numerator += (price * count + (fee ?? 0n)) * denominator;
      continue;
    }
    if (count === 0n || shares === null || count > shares) {
      shares = null;
      numerator = null;
      warnings.add('unmatched_sale');
      continue;
    }
    const previous = shares;
    shares -= count;
    if (shares === 0n) {
      numerator = 0n;
      denominator = 1n;
    } else if (numerator !== null) {
      numerator *= shares;
      denominator *= previous;
      const common = gcd(numerator, denominator);
      numerator /= common;
      denominator /= common;
    }
  }
  if (shares !== null && shares > 0n && numerator === null)
    warnings.add('cost_basis_unknown');
  return {
    shares: shares === null ? null : shares.toString(),
    investedVnd: numerator === null ? null : format(numerator, denominator),
    averageCostVnd:
      numerator === null || shares === null || shares === 0n
        ? null
        : format(numerator, denominator * shares),
    warnings: [...warnings],
    asOf,
  };
}
