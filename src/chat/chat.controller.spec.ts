import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatResponseInterceptor } from './chat-response.interceptor';
import { ChatExceptionFilter } from './chat-exception.filter';

describe('ChatController', () => {
  let app: INestApplication;
  let chatService: { sendMessage: jest.Mock };

  beforeEach(async () => {
    chatService = { sendMessage: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [{ provide: ChatService, useValue: chatService }],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.useGlobalInterceptors(new ChatResponseInterceptor());
    app.useGlobalFilters(new ChatExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/v1/chat/messages', () => {
    it('creates an implicit session and returns ApiResponse on success', async () => {
      chatService.sendMessage.mockResolvedValue({
        sessionId: 'new-session-123',
        reply: 'Hello, how can I help?',
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/chat/messages')
        .send({ message: 'Hi there' })
        .expect(201);

      expect(response.body).toEqual({
        status: 'success',
        message: 'Message sent successfully',
        data: {
          sessionId: 'new-session-123',
          reply: 'Hello, how can I help?',
        },
      });
    });

    it('returns 400 ApiResponse when message is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/chat/messages')
        .send({ message: '' })
        .expect(400);

      expect(response.body.status).toBe('error');
      expect(response.body.data).toBeNull();
    });

    it('returns 400 ApiResponse when message is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/chat/messages')
        .send({})
        .expect(400);

      expect(response.body.status).toBe('error');
      expect(response.body.data).toBeNull();
    });
  });

  describe('POST /api/v1/chat/sessions/:sessionId/messages', () => {
    it('continues a session and returns ApiResponse', async () => {
      chatService.sendMessage.mockResolvedValue({
        sessionId: 'session-abc',
        reply: 'Continuing conversation...',
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/chat/sessions/session-abc/messages')
        .send({ message: 'Another question' })
        .expect(200);

      expect(response.body).toEqual({
        status: 'success',
        message: 'Message sent successfully',
        data: {
          sessionId: 'session-abc',
          reply: 'Continuing conversation...',
        },
      });
    });
  });

  describe('POST /api/v1/chat/messages with x-user-id', () => {
    it('passes userId from header to ChatService', async () => {
      chatService.sendMessage.mockResolvedValue({
        sessionId: 'session-xyz',
        reply: 'Hello user!',
      });

      await request(app.getHttpServer())
        .post('/api/v1/chat/messages')
        .set('x-user-id', 'user-42')
        .send({ message: 'Hello' })
        .expect(201);

      expect(chatService.sendMessage).toHaveBeenCalledWith({
        message: 'Hello',
        userId: 'user-42',
      });
    });
  });
});
