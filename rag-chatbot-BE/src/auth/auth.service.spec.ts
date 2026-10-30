import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { AuthService } from './auth.service';

describe('Personal account access', () => {
  const secret = 'test-only-session-signing-key';
  const token = (email: string, exp = Math.floor(Date.now() / 1000) + 60) => {
    const head = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({ id: 'google-user', email, exp }),
    ).toString('base64url');
    return `${head}.${body}.${createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`;
  };
  const service = (allowedEmail?: string) =>
    new AuthService(
      new ConfigService({ auth: { jwtSecret: secret, allowedEmail } }),
    );

  it('accepts only the configured verified account, regardless of letter case', () => {
    expect(
      service('owner@example.com').verifySessionToken(
        token('Owner@example.com'),
      ).id,
    ).toBe('google-user');
    expect(() =>
      service('owner@example.com').verifySessionToken(
        token('another@example.com'),
      ),
    ).toThrow();
  });

  it('fails closed for missing configuration, expired sessions and tampered tokens', () => {
    expect(() =>
      service().verifySessionToken(token('owner@example.com')),
    ).toThrow();
    expect(() =>
      service('owner@example.com').verifySessionToken(
        token('owner@example.com', 1),
      ),
    ).toThrow();
    expect(() =>
      service('owner@example.com').verifySessionToken(
        `${token('owner@example.com')}tampered`,
      ),
    ).toThrow();
  });
});
