import {
  InvalidPurchaseCursorError,
  PurchaseCursorCodec,
} from './purchase-cursor.codec';

describe('PurchaseCursorCodec', () => {
  const binding = {
    userId: 'google-user-123',
    filterFingerprint: 'filter-sha256',
    rangeStart: '2026-09-01T17:00:00.000Z',
    rangeEnd: '2026-10-01T17:00:00.000Z',
  };
  const position = {
    totalPrice: '120000',
    itemId: '00000000-0000-4000-8000-000000000001',
    asOf: '2026-09-22T05:30:00.000Z',
  };

  it('round-trips a signed cursor without receipt content', () => {
    const codec = new PurchaseCursorCodec(
      'a-dedicated-test-secret',
      () => new Date('2026-09-22T05:30:00.000Z'),
    );

    const cursor = codec.encode(position, binding);

    expect(codec.decode(cursor, binding)).toEqual(position);
    const decodedPayload = Buffer.from(
      cursor.split('.')[0],
      'base64url',
    ).toString('utf8');
    expect(decodedPayload).not.toContain('google-user-123');
    expect(decodedPayload).not.toContain('merchant');
    expect(decodedPayload).not.toContain('item name');
  });

  it('rejects an altered cursor', () => {
    const codec = new PurchaseCursorCodec('a-dedicated-test-secret');
    const cursor = codec.encode(position, binding);
    const [payload, signature] = cursor.split('.');
    const alteredPayload = `${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}`;

    expect(() =>
      codec.decode(`${alteredPayload}.${signature}`, binding),
    ).toThrow(InvalidPurchaseCursorError);
    try {
      codec.decode(`${alteredPayload}.${signature}`, binding);
    } catch (error: unknown) {
      expect((error as InvalidPurchaseCursorError).code).toBe('CURSOR_INVALID');
    }
  });

  it('rejects an expired cursor', () => {
    let now = new Date('2026-09-22T05:30:00.000Z');
    const codec = new PurchaseCursorCodec(
      'a-dedicated-test-secret',
      () => now,
      60_000,
    );
    const cursor = codec.encode(position, binding);
    now = new Date('2026-09-22T05:31:01.000Z');

    expect(() => codec.decode(cursor, binding)).toThrow(
      InvalidPurchaseCursorError,
    );
    try {
      codec.decode(cursor, binding);
    } catch (error: unknown) {
      expect((error as InvalidPurchaseCursorError).code).toBe('CURSOR_EXPIRED');
    }
  });

  it('rejects use by another user or with different filters', () => {
    const codec = new PurchaseCursorCodec('a-dedicated-test-secret');
    const cursor = codec.encode(position, binding);

    for (const changedBinding of [
      { ...binding, userId: 'another-user' },
      { ...binding, filterFingerprint: 'different-filter' },
    ]) {
      expect(() => codec.decode(cursor, changedBinding)).toThrow(
        InvalidPurchaseCursorError,
      );
    }
  });
});
