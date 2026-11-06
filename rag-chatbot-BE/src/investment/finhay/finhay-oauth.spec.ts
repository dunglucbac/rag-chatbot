import { randomBytes } from 'crypto';
import {
  encryptionKey,
  FinhayOAuthProvider,
  seal,
  unseal,
} from './finhay-oauth';

describe('Finhay credential security', () => {
  it('encrypts credentials per owner and rejects tampering', () => {
    const key = randomBytes(32);
    const payload = seal(
      { tokens: { access_token: 'secret', token_type: 'Bearer' } },
      key,
      'alice',
    );
    expect(payload).not.toContain('secret');
    expect(unseal(payload, key, 'alice').tokens?.access_token).toBe('secret');
    expect(() => unseal(payload, key, 'bob')).toThrow();
    const parts = payload.split('.');
    parts[2] = Buffer.from('tampered').toString('base64url');
    expect(() => unseal(parts.join('.'), key, 'alice')).toThrow();
    expect(() => encryptionKey('not-a-key')).toThrow();
  });

  it('requests market access only and rejects unsafe scopes and redirects', () => {
    const provider = new FinhayOAuthProvider(
      {},
      'http://localhost:3000/investments/finhay/callback',
      'state',
    );
    expect(provider.clientMetadata.scope).toBe('read:market');
    expect(() =>
      provider.saveTokens({
        access_token: 'x',
        token_type: 'Bearer',
        scope: 'read:market read:account',
      }),
    ).toThrow();
    expect(() =>
      provider.redirectToAuthorization(
        new URL('https://example.com/?scope=read%3Amarket&state=state'),
      ),
    ).toThrow();
    const valid = new URL(
      'https://open-api.fhsc.com.vn/auth/v1/oa/oauth/authorize?scope=read%3Amarket&state=state',
    );
    provider.redirectToAuthorization(valid);
    expect(provider.authorizationUrl).toBe(valid.toString());
  });

  it('does not retain another account refresh token after a new authorization', () => {
    const secrets = {
      tokens: {
        access_token: 'old',
        token_type: 'Bearer',
        refresh_token: 'old-refresh',
      },
    };
    const provider = new FinhayOAuthProvider(
      secrets,
      'http://localhost:3000/investments/finhay/callback',
      'state',
      false,
      false,
    );
    provider.saveTokens({
      access_token: 'new',
      token_type: 'Bearer',
      scope: 'read:market',
    });
    expect(secrets.tokens.refresh_token).toBeUndefined();
  });
});
