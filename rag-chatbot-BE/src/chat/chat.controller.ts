import {
  Controller,
  Delete,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  Logger,
  Get,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dtos/send-message.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { GoogleAuthGuard } from '../auth/google-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AttachUploadDto } from './dtos/attach-upload.dto';
import { pageNumber } from '../common/pagination';

@Controller('chat')
@UseGuards(GoogleAuthGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly chatService: ChatService) {}

  @Post('sessions')
  createSession(@CurrentUser() user: AuthenticatedUser) {
    return this.chatService.createSession(user.id);
  }

  @Get('sessions')
  listSessions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('offset') offset?: string,
  ) {
    return this.chatService.listSessions(user.id, pageNumber(offset));
  }

  @Get('sessions/:sessionId')
  getSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Query('before') before?: string,
  ) {
    return this.chatService.getSession(
      user.id,
      sessionId,
      before === undefined ? undefined : pageNumber(before),
    );
  }

  @Post('sessions/:sessionId/uploads')
  attachUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: AttachUploadDto,
  ) {
    return this.chatService.attachUpload(
      user.id,
      sessionId,
      dto.ingestionJobId,
    );
  }

  @Post('messages')
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chatService.sendMessage({
      message: dto.message,
      userId: user.id,
      ...(dto.ingestionJobId
        ? {
            ingestionJobId: dto.ingestionJobId,
            ...(dto.reviewAction ? { reviewAction: dto.reviewAction } : {}),
            ...(dto.paymentItemName
              ? { paymentItemName: dto.paymentItemName }
              : {}),
          }
        : {}),
    });
  }

  @Post('sessions/:sessionId/messages')
  @HttpCode(HttpStatus.OK)
  async sendMessageToSession(
    @Param('sessionId') sessionId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.logger.log(`POST /chat/sessions/${sessionId}/messages`);
    return this.chatService.sendMessage({
      message: dto.message,
      sessionId,
      userId: user.id,
      ...(dto.ingestionJobId
        ? {
            ingestionJobId: dto.ingestionJobId,
            ...(dto.reviewAction ? { reviewAction: dto.reviewAction } : {}),
            ...(dto.paymentItemName
              ? { paymentItemName: dto.paymentItemName }
              : {}),
          }
        : {}),
    });
  }

  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSession(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.chatService.deleteSession(user.id, sessionId);
  }
}
