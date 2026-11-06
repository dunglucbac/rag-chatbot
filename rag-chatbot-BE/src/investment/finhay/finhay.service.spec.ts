import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { FinhayConnection } from '../entities/finhay-connection.entity';
import { FinhayService } from './finhay.service';
import { seal, unseal } from './finhay-oauth';

const key = Buffer.alloc(32, 7);
const redirectUri = 'http://localhost:3000/investments/finhay/callback';
const metadata = {
  issuer: 'https://mcp.fhsc.com.vn',
  authorization_endpoint:
    'https://open-api.fhsc.com.vn/auth/v1/oa/oauth/authorize',
  token_endpoint: 'https://open-api.fhsc.com.vn/auth/v1/oa/oauth/token',
  registration_endpoint:
    'https://open-api.fhsc.com.vn/auth/v1/oa/oauth/register',
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  token_endpoint_auth_methods_supported: ['none'],
  code_challenge_methods_supported: ['S256'],
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('Finhay application connection', () => {
  let db: DataSource;
  let service: FinhayService;
  let tokenCalls: number;
  let failQuote: boolean;
  let unauthorizedOnce: boolean;
  let requests: Array<{ url: string; body: string }>;

  beforeEach(async () => {
    db = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [FinhayConnection],
      synchronize: true,
    }).initialize();
    service = new FinhayService(
      db,
      new ConfigService({
        finhay: { encryptionKey: key.toString('base64'), redirectUri },
      }),
    );
    tokenCalls = 0;
    failQuote = false;
    unauthorizedOnce = false;
    requests = [];
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async (input: string | URL | Request, init?: RequestInit) => {
          await Promise.resolve();
          const url =
            typeof input === 'string' || input instanceof URL
              ? String(input)
              : input.url;
          const body =
            typeof init?.body === 'string'
              ? init.body
              : init?.body instanceof URLSearchParams
                ? init.body.toString()
                : '';
          requests.push({ url, body });
          if (url.includes('/.well-known/oauth-protected-resource'))
            return json({
              resource: 'https://mcp.fhsc.com.vn/',
              authorization_servers: ['https://mcp.fhsc.com.vn'],
              scopes_supported: ['read:market', 'read:account'],
              bearer_methods_supported: ['header'],
            });
          if (url.includes('/.well-known/oauth-authorization-server'))
            return json(metadata);
          if (url.endsWith('/oauth/register'))
            return json({
              client_id: 'client-id',
              redirect_uris: [redirectUri],
              token_endpoint_auth_method: 'none',
              grant_types: ['authorization_code', 'refresh_token'],
              response_types: ['code'],
            });
          if (url.endsWith('/oauth/token')) {
            tokenCalls++;
            return json({
              access_token: `token-${tokenCalls}`,
              token_type: 'Bearer',
              expires_in: 60,
              refresh_token: `refresh-${tokenCalls}`,
              scope: 'read:market',
            });
          }
          if (url.endsWith('/oauth/revoke'))
            return new Response(null, { status: 200 });
          if (url.endsWith('/mcp')) {
            if (unauthorizedOnce) {
              unauthorizedOnce = false;
              return json({ error: 'expired' }, 401);
            }
            if (init?.method === 'GET' || init?.method === 'DELETE')
              return new Response(null, { status: 405 });
            const message = JSON.parse(body) as {
              id?: number;
              method: string;
              params?: { protocolVersion?: string };
            };
            if (message.method === 'initialize')
              return json({
                jsonrpc: '2.0',
                id: message.id,
                result: {
                  protocolVersion: message.params?.protocolVersion,
                  capabilities: { tools: {} },
                  serverInfo: { name: 'fake-finhay', version: '1' },
                },
              });
            if (message.method === 'notifications/initialized')
              return new Response(null, { status: 202 });
            if (message.method === 'tools/call')
              return failQuote
                ? json({ error: 'unavailable' }, 503)
                : json({
                    jsonrpc: '2.0',
                    id: message.id,
                    result: {
                      content: [],
                      structuredContent: {
                        symbol: 'VCB',
                        currency: 'VND',
                        price: 54000,
                        updated_at: '2026-11-06T09:00:00+07:00',
                      },
                    },
                  });
          }
          throw new Error(`Unexpected request ${url}`);
        },
      );
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await db.destroy();
  });

  it('registers market-only access, binds the callback, encrypts tokens and reads a quote', async () => {
    const { authorizationUrl } = await service.start('alice');
    const url = new URL(authorizationUrl);
    expect(url.searchParams.get('scope')).toBe('read:market');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    const registration = requests.find((item) =>
      item.url.endsWith('/oauth/register'),
    );
    expect(JSON.parse(registration!.body)).toMatchObject({
      scope: 'read:market',
    });
    const state = url.searchParams.get('state');
    await expect(service.callback('wrong', 'code')).rejects.toThrow();
    await service.callback(state, 'code');
    await expect(service.callback(state, 'code')).rejects.toThrow();
    const row = await db
      .getRepository(FinhayConnection)
      .findOneByOrFail({ userId: 'alice' });
    expect(row.encryptedData).not.toContain('token-1');
    expect(await service.status('alice')).toEqual({ connected: true });
    expect(await service.status('bob')).toEqual({ connected: false });
    await expect(service.quote('bob', 'VCB')).rejects.toThrow();
    expect(await service.quote('alice', 'vcb')).toMatchObject({
      symbol: 'VCB',
      priceVnd: 54000,
      source: 'Finhay',
    });
    expect(await service.disconnect('alice')).toEqual({
      connected: false,
      revoked: true,
    });
    expect(await service.status('alice')).toEqual({ connected: false });
  });

  it('persists rotated credentials before a failing market request', async () => {
    const url = new URL((await service.start('alice')).authorizationUrl);
    await service.callback(url.searchParams.get('state'), 'code');
    const repo = db.getRepository(FinhayConnection);
    const row = await repo.findOneByOrFail({ userId: 'alice' });
    const secrets = unseal(row.encryptedData, key, 'alice');
    secrets.expiresAt = Date.now() - 1;
    row.encryptedData = seal(secrets, key, 'alice');
    await repo.save(row);
    failQuote = true;
    await expect(service.quote('alice', 'VCB')).rejects.toThrow();
    const saved = await repo.findOneByOrFail({ userId: 'alice' });
    expect(
      unseal(saved.encryptedData, key, 'alice').tokens?.refresh_token,
    ).toBe('refresh-2');
  });

  it('refreshes once if Finhay rejects an apparently unexpired access token', async () => {
    const url = new URL((await service.start('alice')).authorizationUrl);
    await service.callback(url.searchParams.get('state'), 'code');
    unauthorizedOnce = true;
    expect(await service.quote('alice', 'VCB')).toMatchObject({
      priceVnd: 54000,
    });
    expect(tokenCalls).toBe(2);
  });
});
