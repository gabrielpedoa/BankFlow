import { AccountsModule } from '@accounts/accounts.module';
import { Account } from '@accounts/entities/account.entity';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dbConfig } from 'src/config/db.config';
import { AUTHORIZER_TOKEN } from 'src/modules/transfer/authorizer/authorizer.interface';
import { TransferStatus } from 'src/modules/transfer/entities/transfer.entity';
import { TransferModule } from 'src/modules/transfer/transfer.module';
import request from 'supertest';
import { DataSource } from 'typeorm';

// Autorizador mock — aprovado por padrão, pode ser sobrescrito por teste
const mockAuthorizer = {
  authorize: jest.fn().mockResolvedValue({ success: true, authorized: true }),
};

describe('TransfersController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let senderId: number;
  let receiverId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot(dbConfig),
        ScheduleModule.forRoot(),
        AccountsModule,
        TransferModule,
      ],
    })
      .overrideProvider(AUTHORIZER_TOKEN)
      .useValue(mockAuthorizer)
      .compile();

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

    dataSource = moduleFixture.get(DataSource);

    // Seed: sender com saldo, receiver zerado
    const accountRepo = dataSource.getRepository(Account);
    const sender = await accountRepo.save({ name: 'Sender', balance: 1000 });
    const receiver = await accountRepo.save({ name: 'Receiver', balance: 0 });
    senderId = sender.id;
    receiverId = receiver.id;
  });

  afterAll(async () => {
    await dataSource.destroy();
    await app.close();
  });

  beforeEach(() => {
    // Reseta o mock para aprovado antes de cada teste
    mockAuthorizer.authorize.mockResolvedValue({
      success: true,
      authorized: true,
    });
  });

  // ─── POST /api/transfers ───────────────────────────────────────────────────

  describe('POST /api/transfers', () => {
    it('deve processar transferência imediata e retornar COMPLETED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/transfers')
        .send({ sender_id: senderId, receiver_id: receiverId, amount: 50 })
        .expect(201);

      expect(res.body.data.status).toBe(TransferStatus.COMPLETED);
    });

    it('deve criar transferência agendada com status PENDING', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/transfers')
        .send({
          sender_id: senderId,
          receiver_id: receiverId,
          amount: 10,
          scheduled_at: '2099-12-31',
        })
        .expect(201);

      expect(res.body.data.status).toBe(TransferStatus.PENDING);
      expect(res.body.data.scheduled_at).toBe('2099-12-31T00:00:00.000Z');
    });

    it('deve retornar UNAUTHORIZED quando autorizador nega', async () => {
      mockAuthorizer.authorize.mockResolvedValue({
        success: true,
        authorized: false,
      });

      const res = await request(app.getHttpServer())
        .post('/api/transfers')
        .send({ sender_id: senderId, receiver_id: receiverId, amount: 10 })
        .expect(201);

      expect(res.body.data.status).toBe(TransferStatus.UNAUTHORIZED);
    });

    it('deve retornar FAILED quando saldo é insuficiente', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/transfers')
        .send({ sender_id: senderId, receiver_id: receiverId, amount: 999999 })
        .expect(201);

      expect(res.body.data.status).toBe(TransferStatus.FAILED);
    });

    it('deve retornar 400 quando sender_id === receiver_id', async () => {
      await request(app.getHttpServer())
        .post('/api/transfers')
        .send({ sender_id: senderId, receiver_id: senderId, amount: 100 })
        .expect(400);
    });

    it('deve retornar 400 quando sender não existe', async () => {
      await request(app.getHttpServer())
        .post('/api/transfers')
        .send({ sender_id: 9999, receiver_id: receiverId, amount: 100 })
        .expect(400);
    });

    it('deve retornar 400 quando receiver não existe', async () => {
      await request(app.getHttpServer())
        .post('/api/transfers')
        .send({ sender_id: senderId, receiver_id: 9999, amount: 100 })
        .expect(400);
    });

    it('deve retornar 400 quando amount não é enviado', async () => {
      await request(app.getHttpServer())
        .post('/api/transfers')
        .send({ sender_id: senderId, receiver_id: receiverId })
        .expect(400);
    });

    it('deve retornar 400 quando amount é negativo', async () => {
      await request(app.getHttpServer())
        .post('/api/transfers')
        .send({ sender_id: senderId, receiver_id: receiverId, amount: -50 })
        .expect(400);
    });

    it('deve retornar 400 quando amount é zero', async () => {
      await request(app.getHttpServer())
        .post('/api/transfers')
        .send({ sender_id: senderId, receiver_id: receiverId, amount: 0 })
        .expect(400);
    });

    it('deve retornar 400 quando sender_id não é inteiro', async () => {
      await request(app.getHttpServer())
        .post('/api/transfers')
        .send({ sender_id: 'abc', receiver_id: receiverId, amount: 100 })
        .expect(400);
    });

    it('deve retornar 400 quando scheduled_at tem formato inválido', async () => {
      await request(app.getHttpServer())
        .post('/api/transfers')
        .send({
          sender_id: senderId,
          receiver_id: receiverId,
          amount: 10,
          scheduled_at: 'nao-e-data',
        })
        .expect(400);
    });
  });

  // ─── GET /api/transfers ────────────────────────────────────────────────────

  describe('GET /api/transfers', () => {
    it('deve retornar 200 com array de transferências', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/transfers')
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('cada transferência deve ter sender e receiver populados', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/transfers')
        .expect(200);

      const transfer = res.body.data[0];
      expect(transfer).toHaveProperty('sender');
      expect(transfer).toHaveProperty('receiver');
      expect(transfer).toHaveProperty('status');
      expect(transfer).toHaveProperty('amount');
    });
  });
});
