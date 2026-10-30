import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';

@Injectable()
export class GoogleAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const token = this.getBearerToken(authorization);

    if (!token) {
      throw new UnauthorizedException('A Bearer access token is required');
    }

    try {
      request.user = this.authService.verifySessionToken(token);
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  private getBearerToken(authorization?: string): string | undefined {
    const [scheme, token, ...rest] = authorization?.trim().split(/\s+/) ?? [];
    return scheme === 'Bearer' && token && rest.length === 0
      ? token
      : undefined;
  }
}
