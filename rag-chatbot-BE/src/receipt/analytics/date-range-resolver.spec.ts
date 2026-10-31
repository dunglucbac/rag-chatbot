import { DateRangeResolver } from './date-range-resolver';

describe('DateRangeResolver', () => {
  it('resolves last week to the previous Monday-to-Monday range in Ho Chi Minh City', () => {
    const resolver = new DateRangeResolver();

    const range = resolver.resolve(
      { rangeType: 'relative', period: 'last_week' },
      new Date('2026-09-22T12:00:00.000Z'),
    );

    expect(range).toEqual({
      start: new Date('2026-09-13T17:00:00.000Z'),
      end: new Date('2026-09-20T17:00:00.000Z'),
      timeZone: 'Asia/Ho_Chi_Minh',
    });
  });

  it('resolves last month to the previous calendar month in Ho Chi Minh City', () => {
    const resolver = new DateRangeResolver();

    const range = resolver.resolve(
      { rangeType: 'relative', period: 'last_month' },
      new Date('2026-09-22T12:00:00.000Z'),
    );

    expect(range).toEqual({
      start: new Date('2026-07-31T17:00:00.000Z'),
      end: new Date('2026-08-31T17:00:00.000Z'),
      timeZone: 'Asia/Ho_Chi_Minh',
    });
  });

  it('resolves last quarter to the previous complete calendar quarter in Ho Chi Minh City', () => {
    const resolver = new DateRangeResolver();

    const range = resolver.resolve(
      { rangeType: 'relative', period: 'last_quarter' },
      new Date('2026-09-22T12:00:00.000Z'),
    );

    expect(range).toEqual({
      start: new Date('2026-03-31T17:00:00.000Z'),
      end: new Date('2026-06-30T17:00:00.000Z'),
      timeZone: 'Asia/Ho_Chi_Minh',
    });
  });

  it('resolves last quarter across a calendar-year boundary', () => {
    const resolver = new DateRangeResolver();

    const range = resolver.resolve(
      { rangeType: 'relative', period: 'last_quarter' },
      new Date('2026-01-15T12:00:00.000Z'),
    );

    expect(range).toEqual({
      start: new Date('2025-09-30T17:00:00.000Z'),
      end: new Date('2025-12-31T17:00:00.000Z'),
      timeZone: 'Asia/Ho_Chi_Minh',
    });
  });

  it('resolves an explicit local date range to UTC boundaries', () => {
    const resolver = new DateRangeResolver();

    const range = resolver.resolve({
      rangeType: 'absolute',
      startDate: '2026-09-01',
      endDate: '2026-10-01',
    });

    expect(range).toEqual({
      start: new Date('2026-08-31T17:00:00.000Z'),
      end: new Date('2026-09-30T17:00:00.000Z'),
      timeZone: 'Asia/Ho_Chi_Minh',
    });
  });

  it('rejects explicit ranges longer than 366 days', () => {
    const resolver = new DateRangeResolver();

    expect(() =>
      resolver.resolve({
        rangeType: 'absolute',
        startDate: '2025-01-01',
        endDate: '2026-01-03',
      }),
    ).toThrow('Date range cannot exceed 366 days');
  });

  it('rejects an explicit range whose end is not after its start', () => {
    const resolver = new DateRangeResolver();

    expect(() =>
      resolver.resolve({
        rangeType: 'absolute',
        startDate: '2026-09-22',
        endDate: '2026-09-22',
      }),
    ).toThrow('End date must be after start date');
  });
});
