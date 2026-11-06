import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';

export interface FinhaySecrets {
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  verifier?: string;
  expiresAt?: number;
}

export function encryptionKey(value?: string): Buffer {
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value))
    throw new Error(
      'FINHAY_OAUTH_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
    );
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32)
    throw new Error(
      'FINHAY_OAUTH_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
    );
  return key;
}

export function seal(data: FinhaySecrets, key: Buffer, userId: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(userId));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), 'utf8'),
    cipher.final(),
  ]);
  return [nonce, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString('base64url'))
    .join('.');
}

export function unseal(
  value: string,
  key: Buffer,
  userId: string,
): FinhaySecrets {
  const parts = value.split('.');
  if (parts.length !== 3)
    throw new Error('Invalid encrypted Finhay credentials');
  const [nonce, tag, ciphertext] = parts.map((part) =>
    Buffer.from(part, 'base64url'),
  );
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      'utf8',
    ),
  ) as FinhaySecrets;
}

export class FinhayOAuthProvider implements OAuthClientProvider {
  authorizationUrl?: string;
  constructor(
    readonly secrets: FinhaySecrets,
    readonly redirectUrl: string,
    private readonly oauthState: string,
    private readonly ignoreTokens = false,
    private readonly preserveRefresh = true,
  ) {}

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.redirectUrl],
      client_name: 'Personal investment journal',
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'read:market',
    };
  }
  state() {
    return this.oauthState;
  }
  clientInformation() {
    return this.secrets.client;
  }
  saveClientInformation(info: OAuthClientInformationMixed) {
    this.secrets.client = info;
  }
  tokens() {
    return this.ignoreTokens ? undefined : this.secrets.tokens;
  }
  saveTokens(tokens: OAuthTokens) {
    if (
      tokens.token_type.toLowerCase() !== 'bearer' ||
      (tokens.scope &&
        (tokens.scope.split(/\s+/).some((scope) => scope !== 'read:market') ||
          !tokens.scope.split(/\s+/).includes('read:market')))
    )
      throw new Error('Finhay returned an unexpected token scope');
    this.secrets.tokens = {
      ...tokens,
      refresh_token:
        tokens.refresh_token ??
        (this.preserveRefresh ? this.secrets.tokens?.refresh_token : undefined),
    };
    this.secrets.expiresAt =
      tokens.expires_in === undefined
        ? undefined
        : Date.now() + tokens.expires_in * 1000;
  }
  redirectToAuthorization(url: URL) {
    if (
      url.origin !== 'https://open-api.fhsc.com.vn' ||
      url.pathname !== '/auth/v1/oa/oauth/authorize' ||
      url.searchParams.get('scope') !== 'read:market' ||
      url.searchParams.get('state') !== this.oauthState
    )
      throw new Error('Unexpected Finhay authorization redirect');
    this.authorizationUrl = url.toString();
  }
  saveCodeVerifier(verifier: string) {
    this.secrets.verifier = verifier;
  }
  codeVerifier() {
    if (!this.secrets.verifier)
      throw new Error('Finhay authorization session expired');
    return this.secrets.verifier;
  }
}
