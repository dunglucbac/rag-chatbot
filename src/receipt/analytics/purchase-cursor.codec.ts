import { createHmac, timingSafeEqual } from 'node:crypto';

export type PurchaseCursorErrorCode = 'CURSOR_INVALID' | 'CURSOR_EXPIRED';

export class InvalidPurchaseCursorError extends Error {
  constructor(
    readonly code: PurchaseCursorErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'InvalidPurchaseCursorError';
  }
}

export interface PurchaseCursorBinding {
  userId: string;
  filterFingerprint: string;
  rangeStart: string;
  rangeEnd: string;
}

export interface PurchaseCursorPosition {
  totalPrice: string;
  itemId: string;
  asOf: string;
}

interface SignedPurchaseCursorPayload {
  v: 1;
  uh: string;
  ff: string;
  rs: string;
  re: string;
  as: string;
  tp: string;
  id: string;
  exp: number;
}

const DEFAULT_CURSOR_TTL_MS = 60 * 60 * 1000;

export class PurchaseCursorCodec {
  constructor(
    private readonly secret: string,
    private readonly clock: () => Date = () => new Date(),
    private readonly ttlMs = DEFAULT_CURSOR_TTL_MS,
  ) {
    if (!secret) {
      throw new Error('Purchase cursor HMAC secret is required');
    }
  }

  encode(
    position: PurchaseCursorPosition,
    binding: PurchaseCursorBinding,
  ): string {
    const payload: SignedPurchaseCursorPayload = {
      v: 1,
      uh: this.userHash(binding.userId),
      ff: binding.filterFingerprint,
      rs: binding.rangeStart,
      re: binding.rangeEnd,
      as: position.asOf,
      tp: position.totalPrice,
      id: position.itemId,
      exp: this.clock().getTime() + this.ttlMs,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    return `${encodedPayload}.${this.sign(encodedPayload)}`;
  }

  decode(
    cursor: string,
    binding: PurchaseCursorBinding,
  ): PurchaseCursorPosition {
    const [encodedPayload, encodedSignature, extra] = cursor.split('.');
    if (!encodedPayload || !encodedSignature || extra !== undefined) {
      throw this.invalid();
    }

    const actualSignature = Buffer.from(encodedSignature, 'base64url');
    const expectedSignature = Buffer.from(
      this.sign(encodedPayload),
      'base64url',
    );
    if (
      actualSignature.length !== expectedSignature.length ||
      !timingSafeEqual(actualSignature, expectedSignature)
    ) {
      throw this.invalid();
    }

    let payload: SignedPurchaseCursorPayload;
    try {
      payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as SignedPurchaseCursorPayload;
    } catch {
      throw this.invalid();
    }

    if (!this.isValidPayload(payload)) {
      throw this.invalid();
    }
    if (this.clock().getTime() >= payload.exp) {
      throw new InvalidPurchaseCursorError(
        'CURSOR_EXPIRED',
        'Purchase item cursor has expired',
      );
    }
    if (
      payload.uh !== this.userHash(binding.userId) ||
      payload.ff !== binding.filterFingerprint ||
      payload.rs !== binding.rangeStart ||
      payload.re !== binding.rangeEnd
    ) {
      throw this.invalid();
    }

    return {
      totalPrice: payload.tp,
      itemId: payload.id,
      asOf: payload.as,
    };
  }

  private sign(value: string): string {
    return createHmac('sha256', this.secret).update(value).digest('base64url');
  }

  private userHash(userId: string): string {
    return createHmac('sha256', this.secret)
      .update(`user:${userId}`)
      .digest('base64url');
  }

  private isValidPayload(
    payload: Partial<SignedPurchaseCursorPayload> | null,
  ): payload is SignedPurchaseCursorPayload {
    return (
      payload !== null &&
      payload.v === 1 &&
      typeof payload.uh === 'string' &&
      typeof payload.ff === 'string' &&
      typeof payload.rs === 'string' &&
      typeof payload.re === 'string' &&
      typeof payload.as === 'string' &&
      typeof payload.tp === 'string' &&
      typeof payload.id === 'string' &&
      typeof payload.exp === 'number'
    );
  }

  private invalid(): InvalidPurchaseCursorError {
    return new InvalidPurchaseCursorError(
      'CURSOR_INVALID',
      'Purchase item cursor is invalid for this request',
    );
  }
}
