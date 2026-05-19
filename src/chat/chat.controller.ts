import { Controller, Post, Body, Param, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dtos/send-message.dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('messages')
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(
    @Body() dto: SendMessageDto,
    @Headers('x-user-id') userId?: string,
  ) {
    return this.chatService.sendMessage({
      message: dto.message,
      userId,
    });
  }

  @Post('sessions/:sessionId/messages')
  @HttpCode(HttpStatus.OK)
  async sendMessageToSession(
    @Param('sessionId') sessionId: string,
    @Body() dto: SendMessageDto,
    @Headers('x-user-id') userId?: string,
  ) {
    return this.chatService.sendMessage({
      message: dto.message,
      sessionId,
      userId,
    });
  }
}
