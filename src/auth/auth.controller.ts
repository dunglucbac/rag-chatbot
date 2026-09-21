import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { GoogleAuthGuard } from './google-auth.guard';
import type { AuthenticatedUser, GoogleSignInResult } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('google')
  startGoogleSignIn(@Res() response: Response): void {
    const { authorizationUrl, state } = this.authService.beginGoogleSignIn();
    response.cookie('google_oauth_state', state, {
      httpOnly: true,
      maxAge: 10 * 60 * 1000,
      path: '/auth/google/callback',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    response.redirect(authorizationUrl);
  }

  @Get('google/callback')
  async completeGoogleSignIn(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<GoogleSignInResult | void> {
    if (
      !state ||
      this.getCookie(request.headers.cookie, 'google_oauth_state') !== state
    ) {
      throw new BadRequestException('Invalid Google OAuth state');
    }
    const result = await this.authService.signInWithGoogle(code, state);
    const successRedirectUrl = this.authService.getSuccessRedirectUrl();
    response.clearCookie('google_oauth_state', {
      path: '/auth/google/callback',
    });
    if (!successRedirectUrl) {
      return result;
    }

    const url = new URL(successRedirectUrl);
    url.hash = new URLSearchParams({
      access_token: result.accessToken,
      token_type: result.tokenType,
      expires_in: String(result.expiresIn),
    }).toString();
    response.redirect(url.toString());
  }

  @Get('me')
  @UseGuards(GoogleAuthGuard)
  getCurrentUser(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  private getCookie(
    header: string | undefined,
    name: string,
  ): string | undefined {
    return header
      ?.split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${name}=`))
      ?.slice(name.length + 1);
  }
}
