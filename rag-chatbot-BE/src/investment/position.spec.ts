import { InvestmentEvent } from './entities/investment-event.entity';
import { calculatePosition } from './position';

function event(
  type: string,
  details: Record<string, unknown>,
  occurredOn = '2025-01-01',
): InvestmentEvent {
  return { type, details, occurredOn } as InvestmentEvent;
}
const asOf = '2025-12-31';

describe('calculatePosition', () => {
  it('uses weighted cost including disclosed buy fees and preserves basis after selling', () => {
    const result = calculatePosition(
      [
        event('buy', { shares: 100, priceVnd: '10', feesVnd: '10' }),
        event(
          'buy',
          { shares: 100, priceVnd: '20', feesVnd: '0' },
          '2025-01-02',
        ),
        event('sell', { shares: 50, priceVnd: '30' }, '2025-01-03'),
      ],
      asOf,
    );
    expect(result).toMatchObject({
      shares: '150',
      averageCostVnd: '15.0500',
      investedVnd: '2257.5000',
      warnings: [],
    });
  });

  it('keeps an unknown opening basis unknown through further purchases', () => {
    const result = calculatePosition(
      [
        event('position', { shares: 100 }),
        event('buy', { shares: 50, priceVnd: '20' }, '2025-01-02'),
      ],
      asOf,
    );
    expect(result).toMatchObject({
      shares: '150',
      averageCostVnd: null,
      investedVnd: null,
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        'cost_basis_unknown',
        'purchase_fees_not_provided',
      ]),
    );
  });

  it('flags incomplete sale history until a new position snapshot', () => {
    const incomplete = calculatePosition(
      [
        event('sell', { shares: 10, priceVnd: '1' }),
        event('buy', { shares: 2, priceVnd: '1' }),
      ],
      asOf,
    );
    expect(incomplete).toMatchObject({
      shares: null,
      averageCostVnd: null,
      investedVnd: null,
    });
    expect(incomplete.warnings).toContain('unmatched_sale');
    const restored = calculatePosition(
      [
        event('sell', { shares: 10, priceVnd: '1' }),
        event('position', { shares: 20, averageCostVnd: '2' }, '2025-01-02'),
      ],
      asOf,
    );
    expect(restored).toMatchObject({
      shares: '20',
      averageCostVnd: '2.0000',
      investedVnd: '40.0000',
    });
    expect(restored.warnings).not.toContain('unmatched_sale');
  });

  it('does not include future transactions or claim a watchlisted position', () => {
    expect(
      calculatePosition([event('interest', { level: 'high' })], asOf).shares,
    ).toBeNull();
    const result = calculatePosition(
      [event('buy', { shares: 5, priceVnd: '2' }, '2026-01-01')],
      asOf,
    );
    expect(result.shares).toBeNull();
    expect(result.warnings).toContain('future_event_excluded');
  });

  it('retains precision for large values and reports same-day ordering', () => {
    const result = calculatePosition(
      [
        event('position', {
          shares: 1000000000,
          averageCostVnd: '999999999999.9999',
        }),
        event('buy', { shares: 1, priceVnd: '0.0001', feesVnd: '0' }),
      ],
      asOf,
    );
    expect(result.shares).toBe('1000000001');
    expect(result.investedVnd).toBe('999999999999999900000.0001');
    expect(result.warnings).toContain('same_day_order_assumed');
  });
});
