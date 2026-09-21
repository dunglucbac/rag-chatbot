import {
  Controller,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dtos/send-message.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { GoogleAuthGuard } from '../auth/google-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';

@Controller('chat')
@UseGuards(GoogleAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('messages')
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chatService.sendMessage({
      message: dto.message,
      userId: user.id,
    });
  }

  @Post('sessions/:sessionId/messages')
  @HttpCode(HttpStatus.OK)
  async sendMessageToSession(
    @Param('sessionId') sessionId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chatService.sendMessage({
      message: dto.message,
      sessionId,
      userId: user.id,
    });
  }
}
