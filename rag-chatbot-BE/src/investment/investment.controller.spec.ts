import { INestApplication } from '@nestjs/common';
import { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { GoogleAuthGuard } from '../auth/google-auth.guard';
import { InvestmentEvent } from './entities/investment-event.entity';
import { InvestmentStock } from './entities/investment-stock.entity';
import { InvestmentController } from './investment.controller';
import { InvestmentService } from './investment.service';

describe('Investment API', () => {
  let app: INestApplication;
  let db: DataSource;

  beforeAll(async () => {
    db = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [InvestmentStock, InvestmentEvent],
      synchronize: true,
    }).initialize();
    const module = await Test.createTestingModule({
      controllers: [InvestmentController],
      providers: [
        InvestmentService,
        GoogleAuthGuard,
        { provide: DataSource, useValue: db },
        {
          provide: AuthService,
          useValue: {
            verifySessionToken: (token: string) => {
              if (!['alice', 'bob'].includes(token))
                throw new Error('Invalid token');
              return { id: token, email: `${token}@example.test` };
            },
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    await db.destroy();
  });

  it('requires authentication and does not expose another user’s journal', async () => {
    const server = app.getHttpServer() as Server;
    await request(server).get('/investments/stocks').expect(401);
    await request(server)
      .post('/investments/stocks/VCB/events')
      .set('Authorization', 'Bearer alice')
      .send({
        requestId: 'cceaf413-66e2-4b10-9e9a-a9e7ce2db02d',
        type: 'interest',
        occurredOn: '2026-11-06',
        level: 'high',
      })
      .expect(201);
    const own = await request(server)
      .get('/investments/stocks/VCB')
      .set('Authorization', 'Bearer alice')
      .expect(200);
    const body = own.body as { events: unknown[] };
    expect(body.events[0]).toMatchObject({
      type: 'interest',
      level: 'high',
    });
    await request(server)
      .get('/investments/stocks/VCB')
      .set('Authorization', 'Bearer bob')
      .expect(404);
    const other = await request(server)
      .get('/investments/stocks')
      .set('Authorization', 'Bearer bob')
      .expect(200);
    expect(other.body).toEqual([]);
  });
});
