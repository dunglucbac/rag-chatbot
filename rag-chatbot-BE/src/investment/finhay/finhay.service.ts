import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { auth } from '@modelcontextprotocol/sdk/client/auth.js';
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import { FinhayConnection } from '../entities/finhay-connection.entity';
import {
  encryptionKey,
  FinhayOAuthProvider,
  seal,
  unseal,
} from './finhay-oauth';

const MCP_URL = 'https://mcp.fhsc.com.vn/mcp';
const SCOPES = 'read:market';
const quoteSchema = z.object({
  symbol: z.string(),
  currency: z.literal('VND'),
  price: z.number().positive().nullable(),
  updated_at: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  change: z.number().nullable().optional(),
  change_percent: z.number().nullable().optional(),
});
const hash = (state: string) =>
  createHash('sha256').update(state).digest('hex');

const safeFetch: typeof fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => {
  const url = new URL(
    typeof input === 'string' || input instanceof URL ? input : input.url,
  );
  if (
    url.protocol !== 'https:' ||
    !['mcp.fhsc.com.vn', 'open-api.fhsc.com.vn'].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password
  )
    throw new Error('Untrusted Finhay endpoint');
  return fetch(input, {
    ...init,
    redirect: 'error',
    signal: init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
  });
};

@Injectable()
export class FinhayService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  private settings() {
    try {
      const key = encryptionKey(
        this.config.get<string>('finhay.encryptionKey'),
      );
      const redirectUri = this.config.get<string>('finhay.redirectUri');
      if (!redirectUri) throw new Error('Missing callback URL');
      const url = new URL(redirectUri);
      if (
        (url.protocol !== 'https:' &&
          !(
            url.protocol === 'http:' &&
            ['localhost', '127.0.0.1'].includes(url.hostname)
          )) ||
        url.pathname !== '/investments/finhay/callback' ||
        url.search ||
        url.hash ||
        url.username ||
        url.password
      )
        throw new Error('Invalid callback URL');
      return { key, redirectUri: url.toString() };
    } catch {
      throw new ServiceUnavailableException(
        'Finhay connection is not configured',
      );
    }
  }

  private async lock(manager: EntityManager, userId: string) {
    const query = manager
      .getRepository(FinhayConnection)
      .createQueryBuilder('connection')
      .where('connection.userId = :userId', { userId });
    if (this.dataSource.options.type === 'postgres')
      query.setLock('pessimistic_write');
    return query.getOne();
  }

  async status(userId: string) {
    const connection = await this.dataSource
      .getRepository(FinhayConnection)
      .findOneBy({ userId });
    if (!connection) return { connected: false };
    const { key } = this.settings();
    try {
      return {
        connected: Boolean(
          unseal(connection.encryptedData, key, userId).tokens?.access_token,
        ),
      };
    } catch {
      return { connected: false };
    }
  }

  async start(userId: string) {
    const { key, redirectUri } = this.settings();
    const state = randomBytes(32).toString('base64url');
    return this.dataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .insert()
        .into(FinhayConnection)
        .values({
          userId,
          encryptedData: seal({}, key, userId),
          stateHash: null,
          stateExpiresAt: null,
        })
        .orIgnore()
        .execute();
      const connection = await this.lock(manager, userId);
      if (!connection)
        throw new ServiceUnavailableException('Finhay connection unavailable');
      const secrets = unseal(connection.encryptedData, key, userId);
      const provider = new FinhayOAuthProvider(
        secrets,
        redirectUri,
        state,
        true,
      );
      let result: Awaited<ReturnType<typeof auth>>;
      try {
        result = await auth(provider, {
          serverUrl: MCP_URL,
          scope: SCOPES,
          fetchFn: safeFetch,
        });
      } catch {
        throw new ServiceUnavailableException(
          'Unable to start Finhay authorization',
        );
      }
      if (result !== 'REDIRECT' || !provider.authorizationUrl)
        throw new ServiceUnavailableException(
          'Unable to start Finhay authorization',
        );
      connection.encryptedData = seal(secrets, key, userId);
      connection.stateHash = hash(state);
      connection.stateExpiresAt = String(Date.now() + 10 * 60 * 1000);
      await manager.getRepository(FinhayConnection).save(connection);
      return { authorizationUrl: provider.authorizationUrl };
    });
  }

  async callback(state: unknown, code: unknown) {
    if (
      typeof state !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      typeof code !== 'string' ||
      code.length < 1 ||
      code.length > 4096
    )
      throw new BadRequestException('Invalid Finhay authorization response');
    const { key, redirectUri } = this.settings();
    const connection = await this.dataSource
      .getRepository(FinhayConnection)
      .findOneBy({ stateHash: hash(state) });
    if (!connection)
      throw new BadRequestException('Finhay authorization expired');
    await this.dataSource.transaction(async (manager) => {
      const locked = await this.lock(manager, connection.userId);
      if (
        !locked ||
        locked.stateHash !== hash(state) ||
        !locked.stateExpiresAt ||
        Number(locked.stateExpiresAt) <= Date.now()
      )
        throw new BadRequestException('Finhay authorization expired');
      const secrets = unseal(locked.encryptedData, key, locked.userId);
      const provider = new FinhayOAuthProvider(
        secrets,
        redirectUri,
        state,
        false,
        false,
      );
      const result = await auth(provider, {
        serverUrl: MCP_URL,
        scope: SCOPES,
        authorizationCode: code,
        fetchFn: safeFetch,
      });
      if (result !== 'AUTHORIZED' || !secrets.tokens?.access_token)
        throw new ServiceUnavailableException('Finhay authorization failed');
      delete secrets.verifier;
      locked.encryptedData = seal(secrets, key, locked.userId);
      locked.stateHash = null;
      locked.stateExpiresAt = null;
      await manager.getRepository(FinhayConnection).save(locked);
    });
  }

  async disconnect(userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const connection = await this.lock(manager, userId);
      if (!connection) return { connected: false, revoked: true };
      let revoked = false;
      try {
        const { key } = this.settings();
        const secrets = unseal(connection.encryptedData, key, userId);
        const token =
          secrets.tokens?.refresh_token ?? secrets.tokens?.access_token;
        if (!token) revoked = true;
        else if (secrets.client?.client_id) {
          const body = new URLSearchParams({
            token,
            client_id: secrets.client.client_id,
            token_type_hint: secrets.tokens?.refresh_token
              ? 'refresh_token'
              : 'access_token',
          });
          const response = await safeFetch(
            'https://open-api.fhsc.com.vn/auth/v1/oa/oauth/revoke',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body,
            },
          );
          revoked = response.ok;
        }
      } catch {
        // Local disconnect remains available if remote revocation is unreachable.
      }
      await manager.getRepository(FinhayConnection).delete({ userId });
      return { connected: false, revoked };
    });
  }

  private async accessToken(userId: string, rejectedToken?: string) {
    const { key, redirectUri } = this.settings();
    return this.dataSource.transaction(async (manager) => {
      const connection = await this.lock(manager, userId);
      if (!connection)
        throw new ServiceUnavailableException(
          'Connect Finhay to view market prices',
        );
      const secrets = unseal(connection.encryptedData, key, userId);
      if (!secrets.tokens?.access_token)
        throw new ServiceUnavailableException(
          'Connect Finhay to view market prices',
        );
      if (
        (rejectedToken && secrets.tokens.access_token === rejectedToken) ||
        (secrets.expiresAt && secrets.expiresAt <= Date.now() + 30000)
      ) {
        if (!secrets.tokens.refresh_token)
          throw new ServiceUnavailableException(
            'Reconnect Finhay to view market prices',
          );
        const provider = new FinhayOAuthProvider(
          secrets,
          redirectUri,
          randomBytes(32).toString('base64url'),
        );
        let result: Awaited<ReturnType<typeof auth>>;
        try {
          result = await auth(provider, {
            serverUrl: MCP_URL,
            scope: SCOPES,
            fetchFn: safeFetch,
          });
        } catch {
          throw new ServiceUnavailableException(
            'Reconnect Finhay to view market prices',
          );
        }
        if (result !== 'AUTHORIZED')
          throw new ServiceUnavailableException(
            'Reconnect Finhay to view market prices',
          );
        connection.encryptedData = seal(secrets, key, userId);
        await manager.getRepository(FinhayConnection).save(connection);
      }
      return secrets.tokens.access_token;
    });
  }

  async quote(userId: string, value: string) {
    const symbol = value.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,10}$/.test(symbol))
      throw new BadRequestException('Invalid stock symbol');
    const token = await this.accessToken(userId);
    try {
      return await this.fetchQuote(symbol, token);
    } catch (error: unknown) {
      if (error instanceof StreamableHTTPError && error.code === 401) {
        const refreshed = await this.accessToken(userId, token);
        try {
          return await this.fetchQuote(symbol, refreshed);
        } catch {
          /* one refresh attempt */
        }
      }
      throw new ServiceUnavailableException(
        'Finhay quote unavailable; reconnect if the connection has expired',
      );
    }
  }

  async researchSnapshot(userId: string, value: string) {
    const symbol = value.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,10}$/.test(symbol))
      throw new BadRequestException('Invalid stock symbol');
    const token = await this.accessToken(userId);
    try {
      return await this.fetchResearchSnapshot(symbol, token);
    } catch (error: unknown) {
      if (error instanceof StreamableHTTPError && error.code === 401) {
        const refreshed = await this.accessToken(userId, token);
        try {
          return await this.fetchResearchSnapshot(symbol, refreshed);
        } catch {
          // Only one token refresh is attempted.
        }
      }
      throw new ServiceUnavailableException(
        'Finhay research snapshot unavailable',
      );
    }
  }

  private async fetchResearchSnapshot(symbol: string, accessToken: string) {
    const now = Math.floor(Date.now() / 1000);
    const calls = [
      { key: 'quote', name: 'get_stock_quote', args: { symbol } },
      { key: 'overview', name: 'get_company_overview', args: { symbol } },
      ...(['income-statement', 'balance-sheet', 'cash-flow'] as const).map(
        (type) => ({
          key: type,
          name: 'get_financial_statement',
          args: { symbol, type, period: 'quarterly', limit: 5 },
        }),
      ),
      {
        key: 'history',
        name: 'get_stock_history',
        args: { symbol, from: now - 366 * 86400, to: now, resolution: '1D' },
      },
      {
        key: 'news',
        name: 'list_news',
        args: { symbol, topic: 'stock', page: 1, page_size: 10 },
      },
    ];
    const client = new Client({ name: 'investment-journal', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
      requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
      fetch: safeFetch,
    });
    try {
      await client.connect(transport);
      const evidence: Record<string, unknown> = {};
      const unavailable: string[] = [];
      for (const call of calls) {
        try {
          const result = await client.callTool(
            { name: call.name, arguments: call.args },
            undefined,
            { timeout: 15000 },
          );
          if (result.isError) throw new Error('Tool failed');
          let data: unknown = result.structuredContent;
          if (!data) {
            const content = z
              .array(
                z.object({ type: z.string(), text: z.string().optional() }),
              )
              .parse(result.content)
              .find((part) => part.type === 'text');
            if (content?.text) data = JSON.parse(content.text) as unknown;
          }
          const object = z.record(z.unknown()).parse(data);
          if (call.key === 'quote') quoteSchema.parse(object);
          if (
            typeof object.symbol === 'string' &&
            object.symbol.toUpperCase() !== symbol
          )
            throw new Error('Incorrect symbol');
          const rows =
            call.key === 'history'
              ? object.series
              : call.key === 'news'
                ? object.results
                : call.key === 'overview' || call.key === 'quote'
                  ? undefined
                  : object.items;
          if (
            call.key !== 'overview' &&
            call.key !== 'quote' &&
            !Array.isArray(rows)
          )
            throw new Error('Missing data');
          if (JSON.stringify(object).length > 250000)
            throw new Error('Response too large');
          evidence[call.key] = object;
        } catch (error: unknown) {
          if (error instanceof StreamableHTTPError && error.code === 401)
            throw error;
          unavailable.push(call.key);
        }
      }
      return {
        source: 'Finhay',
        symbol,
        retrievedAt: new Date().toISOString(),
        evidence,
        unavailable,
      };
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  private async fetchQuote(symbol: string, accessToken: string) {
    const client = new Client({ name: 'investment-journal', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
      requestInit: {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15000),
      },
      fetch: safeFetch,
    });
    try {
      await client.connect(transport);
      const result = await client.callTool(
        { name: 'get_stock_quote', arguments: { symbol } },
        undefined,
        { timeout: 15000 },
      );
      if (result.isError) throw new Error('Finhay quote unavailable');
      let data: unknown = result.structuredContent;
      if (!data) {
        const content = z
          .array(z.object({ type: z.string(), text: z.string().optional() }))
          .parse(result.content)
          .find((part) => part.type === 'text');
        if (content?.text) data = JSON.parse(content.text) as unknown;
      }
      const quote = quoteSchema.parse(data);
      if (quote.symbol.toUpperCase() !== symbol)
        throw new Error('Finhay returned a different symbol');
      return {
        source: 'Finhay',
        symbol,
        priceVnd: quote.price,
        currency: quote.currency,
        updatedAt: quote.updated_at,
        change: quote.change ?? null,
        changePercent: quote.change_percent ?? null,
      };
    } finally {
      await client.close().catch(() => undefined);
    }
  }
}
