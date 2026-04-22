import { AccountsModule } from '@accounts/accounts.module';
import { describe, it } from '@jest/globals';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dbConfig } from 'src/config/db.config';
import { TransferModule } from 'src/modules/transfer/transfer.module';
import request from 'supertest';

describe('AccountsController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot(dbConfig),
        ScheduleModule.forRoot(),
        AccountsModule,
        TransferModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── POST /api/accounts ────────────────────────────────────────────────────

  describe('POST /api/accounts', () => {
    it('deve criar conta e retornar 201 com dados da conta', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/accounts')
        .send({ name: 'Alice' })
        .expect(201);

      expect(res.body.data).toMatchObject({
        id: expect.any(Number),
        name: 'Alice',
        balance: expect.anything(), // 0 ou "0" dependendo do SQLite
      });
    });

    it('deve retornar 400 quando name não é enviado', async () => {
      await request(app.getHttpServer())
        .post('/api/accounts')
        .send({})
        .expect(400);
    });

    it('deve retornar 400 quando name tem menos de 2 caracteres', async () => {
      await request(app.getHttpServer())
        .post('/api/accounts')
        .send({ name: 'A' })
        .expect(400);
    });

    it('deve retornar 400 quando campos extras são enviados (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/api/accounts')
        .send({ name: 'Alice', balance: 9999 })
        .expect(400);
    });

    it('deve retornar 400 quando name não é string', async () => {
      await request(app.getHttpServer())
        .post('/api/accounts')
        .send({ name: 123 })
        .expect(400);
    });

    it('deve criar múltiplas contas com IDs sequenciais', async () => {
      const res1 = await request(app.getHttpServer())
        .post('/api/accounts')
        .send({ name: 'Bob' })
        .expect(201);

      const res2 = await request(app.getHttpServer())
        .post('/api/accounts')
        .send({ name: 'Carol' })
        .expect(201);

      expect(res2.body.data.id).toBeGreaterThan(res1.body.data.id);
    });
  });

  // ─── GET /api/accounts ─────────────────────────────────────────────────────

  describe('GET /api/accounts', () => {
    it('deve retornar 200 com array de contas', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/accounts')
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('cada conta deve ter id, name e balance', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/accounts')
        .expect(200);

      const account = res.body.data[0];
      expect(account).toHaveProperty('id');
      expect(account).toHaveProperty('name');
      expect(account).toHaveProperty('balance');
    });
  });
});
