import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource, EntitySchema } from 'typeorm';
import { createHmac } from 'crypto';
import { join } from 'path';
import request from 'supertest';
import { ChatController } from './chat/chat.controller';
import { ChatService } from './chat/chat.service';
import { ChatSessionRepository } from './chat/repositories/chat-session.repository';
import { ChatSession } from './chat/entities/chat-session.entity';
import { ChatMessage } from './chat/entities/chat-message.entity';
import { Receipt } from './receipt/entities/receipt.entity';
import { ReceiptItem } from './receipt/entities/receipt-item.entity';
import { IngestionJob } from './ingestion/entities/ingestion-job.entity';
import { ReceiptController } from './receipt/receipt.controller';
import { ReceiptBrowserService } from './receipt/receipt-browser.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { GoogleAuthGuard } from './auth/google-auth.guard';
import { AgentService } from './agent/agent.service';
import { MessageQueueService } from './message-queue/publisher/publisher.service';
import { ResponseInterceptor } from './common/response.interceptor';
import { GlobalExceptionFilter } from './common/exception.filter';

describe('Personal UI HTTP contracts', () => {
  let app: NestExpressApplication;
  let ds: DataSource;
  const secret = 'isolated-http-test-secret';
  const token = (id = 'owner', email = 'owner@example.test') => {
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ id, email, exp: Math.floor(Date.now() / 1000) + 60 }),
    ).toString('base64url');
    return `${header}.${payload}.${createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')}`;
  };
  beforeAll(async () => {
    ds = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      entities: [
        ChatSession,
        ChatMessage,
        Receipt,
        ReceiptItem,
        new EntitySchema({
          name: 'IngestionJob',
          target: IngestionJob,
          tableName: 'ingestion_jobs',
          columns: {
            id: { type: String, primary: true },
            userId: { type: String, name: 'user_id' },
            originalFilename: { type: String, name: 'original_filename' },
          },
        }),
      ],
    }).initialize();
    const module = await Test.createTestingModule({
      controllers: [ChatController, ReceiptController, AuthController],
      providers: [
        ChatService,
        ReceiptBrowserService,
        AuthService,
        GoogleAuthGuard,
        { provide: DataSource, useValue: ds },
        {
          provide: ChatSessionRepository,
          useValue: new ChatSessionRepository(ds.getRepository(ChatSession)),
        },
        {
          provide: AgentService,
          useValue: {
            invoke: jest.fn().mockResolvedValue('Your receipt summary'),
            deleteThread: jest.fn(),
          },
        },
        {
          provide: MessageQueueService,
          useValue: { publish: jest.fn().mockResolvedValue({}) },
        },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            auth: { jwtSecret: secret, allowedEmail: 'owner@example.test' },
          }),
        },
      ],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    app.useStaticAssets(join(__dirname, '../../rag-chatbot-UI/public'));
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    await ds?.destroy();
  });

  it('serves the static UI and protects APIs with the configured account', async () => {
    await request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Content-Type', /html/);
    await request(app.getHttpServer()).get('/app.mjs').expect(200);
    await request(app.getHttpServer()).get('/chat/sessions').expect(401);
    await request(app.getHttpServer())
      .get('/auth/me')
      .auth(token('outsider', 'outsider@example.test'), { type: 'bearer' })
      .expect(401);
    await request(app.getHttpServer())
      .get('/auth/me')
      .auth(token(), { type: 'bearer' })
      .expect(200);
  });

  it('persists chat and upload history, validates attachments, and checks ownership', async () => {
    const session = (
      await request(app.getHttpServer())
        .post('/chat/sessions')
        .auth(token(), { type: 'bearer' })
        .expect(201)
    ).body.data;
    await request(app.getHttpServer())
      .post(`/chat/sessions/${session.id}/messages`)
      .auth(token(), { type: 'bearer' })
      .send({ message: 'Show my purchases' })
      .expect(200);
    const jobId = '44444444-4444-4444-8444-444444444444';
    await ds
      .getRepository(IngestionJob)
      .save({ id: jobId, userId: 'owner', originalFilename: 'receipt.png' });
    await request(app.getHttpServer())
      .post(`/chat/sessions/${session.id}/uploads`)
      .auth(token(), { type: 'bearer' })
      .send({ ingestionJobId: 'invalid' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/chat/sessions/${session.id}/uploads`)
      .auth(token(), { type: 'bearer' })
      .send({ ingestionJobId: jobId })
      .expect(201);
    const history = (
      await request(app.getHttpServer())
        .get(`/chat/sessions/${session.id}`)
        .auth(token(), { type: 'bearer' })
        .expect(200)
    ).body.data;
    expect(history.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'upload',
    ]);
    await request(app.getHttpServer())
      .get(`/chat/sessions/${session.id}`)
      .auth(token('other'), { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .get('/chat/sessions?offset=-1')
      .auth(token(), { type: 'bearer' })
      .expect(400);
  });

  it('edits a saved receipt through HTTP and returns a recoverable conflict for stale edits', async () => {
    const receipt = await ds.getRepository(Receipt).save({
      userId: 'owner',
      merchant: 'Market',
      purchasedAt: new Date(),
      total: 100,
      currency: 'VND',
      source: 'test',
      checksumSha256: 'receipt-test',
    });
    const details = {
      merchant: 'Corrected Market',
      purchasedAt: '2026-10-30T02:00:00.000Z',
      total: 150,
      currency: 'VND',
      confidence: 1,
      discrepancy: null,
      lineItems: [{ name: 'Milk', totalPrice: 150 }],
    };
    const body = { revision: receipt.revision, receipt: details };
    const result = (
      await request(app.getHttpServer())
        .patch(`/receipts/${receipt.id}`)
        .auth(token(), { type: 'bearer' })
        .send(body)
        .expect(200)
    ).body.data;
    expect(result.receipt.total).toBe(150);
    await request(app.getHttpServer())
      .patch(`/receipts/${receipt.id}`)
      .auth(token(), { type: 'bearer' })
      .send(body)
      .expect(409);
    await request(app.getHttpServer())
      .get(`/receipts/${receipt.id}`)
      .auth(token('other'), { type: 'bearer' })
      .expect(404);
    const found = (
      await request(app.getHttpServer())
        .get('/receipts?q=milk')
        .auth(token(), { type: 'bearer' })
        .expect(200)
    ).body.data;
    expect(found.receipts).toHaveLength(1);
  });
});
