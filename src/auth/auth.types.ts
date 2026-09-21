import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export interface GoogleSignInResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthenticatedUser;
}
