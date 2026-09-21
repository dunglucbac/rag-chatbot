import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthGuard } from './google-auth.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, GoogleAuthGuard],
  exports: [AuthService, GoogleAuthGuard],
})
export class AuthModule {}
