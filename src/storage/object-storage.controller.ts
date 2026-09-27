import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { GoogleAuthGuard } from '../auth/google-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateUploadTargetDto } from './dto/create-upload-target.dto';
import { ObjectStorageService } from './object-storage.service';

@Controller('storage')
@UseGuards(GoogleAuthGuard)
export class ObjectStorageController {
  constructor(private readonly objectStorageService: ObjectStorageService) {}

  @Post('upload-targets')
  async createUploadTarget(
    @Body() dto: CreateUploadTargetDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const target = await this.objectStorageService.createUploadTarget(
      user.id,
      dto.originalFilename,
      dto.mimeType,
    );

    return {
      status: 'success',
      message: 'Upload target created',
      data: target,
    };
  }
}
