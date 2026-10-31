import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { AuthService } from './auth.service';

jest.mock('google-auth-library', () => ({ OAuth2Client: jest.fn() }));

describe('Google account access', () => {
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
  const service = () =>
    new AuthService(
      new ConfigService({
        auth: {
          jwtSecret: secret,
          googleClientId: 'test-client',
          googleClientSecret: 'test-secret',
          googleCallbackUrl: 'http://localhost:3000/auth/google/callback',
        },
      }),
    );
  const client = {
    generateAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/'),
    getToken: jest
      .fn()
      .mockResolvedValue({ tokens: { id_token: 'test-id-token' } }),
    verifyIdToken: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(OAuth2Client)
      .mockImplementation(() => client as unknown as OAuth2Client);
  });

  it.each(['owner@example.com', 'another@example.com'])(
    'lets verified account %s sign in and use its session without an email allowlist',
    async (email) => {
      client.verifyIdToken.mockResolvedValue({
        getPayload: () => ({ sub: email, email, email_verified: true }),
      });
      const auth = service();
      const { state } = auth.beginGoogleSignIn();
      const result = await auth.signInWithGoogle('test-code', state);
      expect(auth.verifySessionToken(result.accessToken)).toEqual({
        id: email,
        email,
      });
    },
  );

  it('rejects an account whose email Google has not verified', async () => {
    client.verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'unverified',
        email: 'unverified@example.com',
        email_verified: false,
      }),
    });
    const auth = service();
    const { state } = auth.beginGoogleSignIn();
    await expect(auth.signInWithGoogle('test-code', state)).rejects.toThrow(
      'Google account must have a verified email address',
    );
  });

  it('rejects expired sessions and tampered tokens', () => {
    expect(() =>
      service().verifySessionToken(token('owner@example.com', 1)),
    ).toThrow();
    expect(() =>
      service().verifySessionToken(`${token('owner@example.com')}tampered`),
    ).toThrow();
  });
});
