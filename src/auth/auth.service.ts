import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import type { TokenPayload } from 'google-auth-library';
import type { AuthenticatedUser, GoogleSignInResult } from './auth.types';

interface SessionClaims extends AuthenticatedUser {
  iat: number;
  exp: number;
}

interface OAuthState {
  exp: number;
  nonce: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly config: ConfigService) {}

  beginGoogleSignIn(): { authorizationUrl: string; state: string } {
    const client = this.createGoogleClient();
    const state = this.createState();
    return {
      authorizationUrl: client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'select_account',
        scope: ['openid', 'email', 'profile'],
        state,
      }),
      state,
    };
  }

  async signInWithGoogle(
    code: string | undefined,
    state: string | undefined,
  ): Promise<GoogleSignInResult> {
    if (!code) {
      throw new BadRequestException('Google authorization code is required');
    }
    this.verifyState(state);

    const client = this.createGoogleClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) {
      throw new UnauthorizedException('Google did not return an ID token');
    }

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.required('auth.googleClientId'),
    });
    const user = this.userFromPayload(ticket.getPayload());
    const expiresIn = this.sessionTtlSeconds();

    return {
      accessToken: this.createSessionToken(user, expiresIn),
      tokenType: 'Bearer',
      expiresIn,
      user,
    };
  }

  verifySessionToken(token: string): AuthenticatedUser {
    const [encodedHeader, encodedPayload, signature, ...rest] =
      token.split('.');
    if (!encodedHeader || !encodedPayload || !signature || rest.length > 0) {
      throw new UnauthorizedException();
    }

    const expectedSignature = this.sign(`${encodedHeader}.${encodedPayload}`);
    if (!this.safeEqual(signature, expectedSignature)) {
      throw new UnauthorizedException();
    }

    let claims: SessionClaims;
    try {
      claims = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as SessionClaims;
    } catch {
      throw new UnauthorizedException();
    }

    if (
      !this.isValidUser(claims) ||
      !Number.isInteger(claims.exp) ||
      claims.exp <= Math.floor(Date.now() / 1000)
    ) {
      throw new UnauthorizedException();
    }

    return {
      id: claims.id,
      email: claims.email,
      ...(claims.name ? { name: claims.name } : {}),
      ...(claims.picture ? { picture: claims.picture } : {}),
    };
  }

  getSuccessRedirectUrl(): string | undefined {
    const value = this.config.get<string>('auth.successRedirectUrl')?.trim();
    if (!value) {
      return undefined;
    }

    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error('Unsupported protocol');
      }
      return url.toString();
    } catch {
      throw new ServiceUnavailableException(
        'AUTH_SUCCESS_REDIRECT_URL must be an HTTP(S) URL',
      );
    }
  }

  private createGoogleClient(): OAuth2Client {
    return new OAuth2Client(
      this.required('auth.googleClientId'),
      this.required('auth.googleClientSecret'),
      this.required('auth.googleCallbackUrl'),
    );
  }

  private userFromPayload(
    payload: TokenPayload | undefined,
  ): AuthenticatedUser {
    if (!payload?.sub || !payload.email || !payload.email_verified) {
      throw new UnauthorizedException(
        'Google account must have a verified email address',
      );
    }

    return {
      id: payload.sub,
      email: payload.email,
      ...(payload.name ? { name: payload.name } : {}),
      ...(payload.picture ? { picture: payload.picture } : {}),
    };
  }

  private createState(): string {
    const state: OAuthState = {
      exp: Math.floor(Date.now() / 1000) + 10 * 60,
      nonce: randomBytes(16).toString('base64url'),
    };
    const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  private verifyState(state: string | undefined): void {
    const [payload, signature, ...rest] = state?.split('.') ?? [];
    if (
      !payload ||
      !signature ||
      rest.length > 0 ||
      !this.safeEqual(signature, this.sign(payload))
    ) {
      throw new BadRequestException('Invalid Google OAuth state');
    }

    try {
      const parsed = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as OAuthState;
      if (
        !parsed.nonce ||
        !Number.isInteger(parsed.exp) ||
        parsed.exp < Date.now() / 1000
      ) {
        throw new Error('Expired state');
      }
    } catch {
      throw new BadRequestException('Expired or invalid Google OAuth state');
    }
  }

  private createSessionToken(
    user: AuthenticatedUser,
    expiresIn: number,
  ): string {
    const issuedAt = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ ...user, iat: issuedAt, exp: issuedAt + expiresIn }),
    ).toString('base64url');
    return `${header}.${payload}.${this.sign(`${header}.${payload}`)}`;
  }

  private sign(value: string): string {
    return createHmac('sha256', this.required('auth.jwtSecret'))
      .update(value)
      .digest('base64url');
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  private sessionTtlSeconds(): number {
    const configured = Number(
      this.config.get<string>('auth.jwtExpiresInSeconds'),
    );
    return Number.isInteger(configured) && configured > 0
      ? configured
      : 60 * 60 * 24;
  }

  private required(key: string): string {
    const value = this.config.get<string>(key)?.trim();
    if (!value) {
      throw new ServiceUnavailableException(
        `Missing required authentication configuration: ${key}`,
      );
    }
    return value;
  }

  private isValidUser(value: unknown): value is AuthenticatedUser {
    return (
      typeof value === 'object' &&
      value !== null &&
      'id' in value &&
      typeof value.id === 'string' &&
      value.id.length > 0 &&
      'email' in value &&
      typeof value.email === 'string' &&
      value.email.length > 0
    );
  }
}
