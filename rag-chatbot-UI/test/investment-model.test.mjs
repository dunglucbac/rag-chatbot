import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatInvestmentVnd,
  investmentInput,
} from '../public/investment-model.mjs';

const fields = {
  symbol: 'vcb',
  type: 'buy',
  occurredOn: '2025-11-01',
  note: ' sample ',
  shares: '500',
  priceVnd: '54000.25',
  feesVnd: '',
  averageCostVnd: '',
  level: 'high',
  decision: 'wait',
};

test('builds a reported trade without converting money to a floating point number', () => {
  assert.deepEqual(investmentInput(fields, 'id'), {
    symbol: 'VCB',
    input: {
      requestId: 'id',
      type: 'buy',
      occurredOn: '2025-11-01',
      note: 'sample',
      shares: 500,
      priceVnd: '54000.25',
    },
  });
  assert.throws(() => investmentInput({ ...fields, shares: '0.5' }, 'id'));
  assert.throws(() => investmentInput({ ...fields, priceVnd: '0' }, 'id'));
});

test('formats VND without losing precision or inventing unknown values', () => {
  assert.equal(
    formatInvestmentVnd('999999999999999900000.0001'),
    '999,999,999,999,999,900,000.0001 VND',
  );
  assert.equal(formatInvestmentVnd('12.5000'), '12.5 VND');
  assert.equal(formatInvestmentVnd(null), 'Unknown');
});
