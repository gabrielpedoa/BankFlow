import { AccountRepository } from '@accounts/account.repository';
import { Account } from '@accounts/entities/account.entity';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AUTHORIZER_TOKEN } from 'src/modules/transfer/authorizer/authorizer.interface';
import {
  Transfer,
  TransferStatus,
} from 'src/modules/transfer/entities/transfer.entity';
import { TransfersRepository } from 'src/modules/transfer/transfer.repository';
import { TransfersService } from 'src/modules/transfer/transfer.service';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';

// ─── Factories ────────────────────────────────────────────────────────────────

const makeAccount = (overrides: Partial<Account> = {}): Account =>
  ({
    id: 1,
    name: 'Alice',
    balance: 1000,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Account;

const makeTransfer = (overrides: Partial<Transfer> = {}): Transfer =>
  ({
    id: 1,
    sender_id: 1,
    receiver_id: 2,
    amount: '100.00',
    status: TransferStatus.PENDING,
    scheduled_at: null,
    failure_reason: null,
    idempotency_key: null,
    processed_at: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Transfer;

const makeQueryRunner = (): jest.Mocked<QueryRunner> =>
  ({
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      findOne: jest.fn(),
      save: jest.fn(),
    } as unknown as EntityManager,
  }) as unknown as jest.Mocked<QueryRunner>;

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('TransfersService', () => {
  let service: TransfersService;
  let transfersRepository: jest.Mocked<TransfersRepository>;
  let accountsRepository: jest.Mocked<AccountRepository>;
  let authorizer: { authorize: jest.Mock };
  let queryRunner: ReturnType<typeof makeQueryRunner>;

  beforeEach(async () => {
    queryRunner = makeQueryRunner();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransfersService,
        {
          provide: TransfersRepository,
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findByIdempotencyKey: jest.fn(),
            lockBatch: jest.fn(),
            findAll: jest.fn(),
          },
        },
        {
          provide: AccountRepository,
          useValue: { findById: jest.fn() },
        },
        {
          provide: AUTHORIZER_TOKEN,
          useValue: { authorize: jest.fn() },
        },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn().mockReturnValue(queryRunner),
          },
        },
      ],
    }).compile();

    service = module.get(TransfersService);
    transfersRepository = module.get(TransfersRepository);
    accountsRepository = module.get(AccountRepository);
    authorizer = module.get(AUTHORIZER_TOKEN);
  });

  // ─── create() ───────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('deve lançar BadRequestException se sender_id === receiver_id', async () => {
      await expect(
        service.create({ sender_id: 1, receiver_id: 1, amount: 100 }),
      ).rejects.toThrow(BadRequestException);

      expect(accountsRepository.findById).not.toHaveBeenCalled();
    });

    it('deve lançar BadRequestException se sender não existe', async () => {
      accountsRepository.findById
        .mockResolvedValueOnce(null) // sender
        .mockResolvedValueOnce(makeAccount({ id: 2 })); // receiver

      await expect(
        service.create({ sender_id: 99, receiver_id: 2, amount: 100 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve lançar BadRequestException se receiver não existe', async () => {
      accountsRepository.findById
        .mockResolvedValueOnce(makeAccount({ id: 1 })) // sender
        .mockResolvedValueOnce(null); // receiver

      await expect(
        service.create({ sender_id: 1, receiver_id: 99, amount: 100 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve incluir ambos os IDs na mensagem quando as duas contas não existem', async () => {
      accountsRepository.findById.mockResolvedValue(null);

      const err = await service
        .create({ sender_id: 99, receiver_id: 88, amount: 100 })
        .catch((e) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toContain('Sender account 99');
      expect(err.message).toContain('Receiver account 88');
    });

    it('deve retornar transferência existente quando idempotency_key já existe', async () => {
      accountsRepository.findById
        .mockResolvedValueOnce(makeAccount({ id: 1 }))
        .mockResolvedValueOnce(makeAccount({ id: 2 }));

      const existing = makeTransfer({
        idempotency_key: 'key-abc',
        status: TransferStatus.COMPLETED,
      });
      transfersRepository.findByIdempotencyKey.mockResolvedValue(existing);

      const result = await service.create({
        sender_id: 1,
        receiver_id: 2,
        amount: 100,
        idempotency_key: 'key-abc',
      });

      expect(result).toBe(existing);
      expect(transfersRepository.create).not.toHaveBeenCalled();
    });

    it('deve criar transferência agendada sem processar imediatamente', async () => {
      accountsRepository.findById
        .mockResolvedValueOnce(makeAccount({ id: 1 }))
        .mockResolvedValueOnce(makeAccount({ id: 2 }));

      const transfer = makeTransfer({
        scheduled_at: new Date('2099-12-31'),
        status: TransferStatus.PENDING,
      });
      transfersRepository.create.mockResolvedValue(transfer);

      const result = await service.create({
        sender_id: 1,
        receiver_id: 2,
        amount: 100,
        scheduled_at: '2099-12-31',
      });

      expect(result.status).toBe(TransferStatus.PENDING);
      expect(authorizer.authorize).not.toHaveBeenCalled();
    });

    it('deve criar e processar transferência imediata chamando o autorizador', async () => {
      accountsRepository.findById
        .mockResolvedValueOnce(makeAccount({ id: 1 }))
        .mockResolvedValueOnce(makeAccount({ id: 2 }));

      const transfer = makeTransfer();
      transfersRepository.create.mockResolvedValue(transfer);
      transfersRepository.save.mockImplementation(async (t) => t as Transfer);
      authorizer.authorize.mockResolvedValue({
        success: true,
        authorized: true,
      });

      (queryRunner.manager.findOne as jest.Mock)
        .mockResolvedValueOnce(makeAccount({ id: 1, balance: 500 }))
        .mockResolvedValueOnce(makeAccount({ id: 2, balance: 0 }));
      (queryRunner.manager.save as jest.Mock).mockResolvedValue({});

      await service.create({ sender_id: 1, receiver_id: 2, amount: 100 });

      expect(authorizer.authorize).toHaveBeenCalledWith({
        sender: 1,
        receiver: 2,
        amount: 100,
      });
    });
  });

  // ─── processTransfer() ──────────────────────────────────────────────────────

  describe('processTransfer()', () => {
    it('deve ignorar transferência que não está PENDING', async () => {
      const transfer = makeTransfer({ status: TransferStatus.COMPLETED });

      const result = await service.processTransfer(transfer);

      expect(result.status).toBe(TransferStatus.COMPLETED);
      expect(authorizer.authorize).not.toHaveBeenCalled();
    });

    it('deve marcar como UNAUTHORIZED quando autorizador retorna authorized=false', async () => {
      authorizer.authorize.mockResolvedValue({
        success: true,
        authorized: false,
      });
      transfersRepository.save.mockImplementation(async (t) => t as Transfer);

      const result = await service.processTransfer(makeTransfer());

      expect(result.status).toBe(TransferStatus.UNAUTHORIZED);
      expect(result.failure_reason).toContain('not authorized');
      expect(queryRunner.connect).not.toHaveBeenCalled();
    });

    it('deve marcar como UNAUTHORIZED quando autorizador retorna success=false', async () => {
      authorizer.authorize.mockResolvedValue({
        success: false,
        authorized: true,
      });
      transfersRepository.save.mockImplementation(async (t) => t as Transfer);

      const result = await service.processTransfer(makeTransfer());

      expect(result.status).toBe(TransferStatus.UNAUTHORIZED);
      expect(queryRunner.connect).not.toHaveBeenCalled();
    });

    it('deve marcar como FAILED e fazer rollback quando saldo é insuficiente', async () => {
      authorizer.authorize.mockResolvedValue({
        success: true,
        authorized: true,
      });
      transfersRepository.save.mockImplementation(async (t) => t as Transfer);

      (queryRunner.manager.findOne as jest.Mock)
        .mockResolvedValueOnce(makeAccount({ id: 1, balance: 50 }))
        .mockResolvedValueOnce(makeAccount({ id: 2, balance: 0 }));

      const result = await service.processTransfer(
        makeTransfer({ amount: '100.00' }),
      );

      expect(result.status).toBe(TransferStatus.FAILED);
      expect(result.failure_reason).toBe('Insufficient funds');
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    });

    it('deve completar transferência e atualizar saldos corretamente', async () => {
      authorizer.authorize.mockResolvedValue({
        success: true,
        authorized: true,
      });
      transfersRepository.save.mockImplementation(async (t) => t as Transfer);

      const sender = makeAccount({ id: 1, balance: 500 });
      const receiver = makeAccount({ id: 2, balance: 200 });

      (queryRunner.manager.findOne as jest.Mock)
        .mockResolvedValueOnce(sender)
        .mockResolvedValueOnce(receiver);
      (queryRunner.manager.save as jest.Mock).mockResolvedValue({});

      const result = await service.processTransfer(
        makeTransfer({ amount: '100.00' }),
      );

      expect(result.status).toBe(TransferStatus.COMPLETED);
      expect(sender.balance).toBe(400);
      expect(receiver.balance).toBe(300);
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });

    it('deve setar processed_at ao completar', async () => {
      authorizer.authorize.mockResolvedValue({
        success: true,
        authorized: true,
      });
      transfersRepository.save.mockImplementation(async (t) => t as Transfer);

      (queryRunner.manager.findOne as jest.Mock)
        .mockResolvedValueOnce(makeAccount({ id: 1, balance: 500 }))
        .mockResolvedValueOnce(makeAccount({ id: 2, balance: 0 }));
      (queryRunner.manager.save as jest.Mock).mockResolvedValue({});

      const result = await service.processTransfer(makeTransfer());

      expect(result.processed_at).toBeInstanceOf(Date);
    });

    it('deve lançar erro e chamar rollback + release se banco falhar', async () => {
      authorizer.authorize.mockResolvedValue({
        success: true,
        authorized: true,
      });
      transfersRepository.save.mockImplementation(async (t) => t as Transfer);

      (queryRunner.manager.findOne as jest.Mock).mockRejectedValue(
        new Error('DB connection lost'),
      );

      await expect(service.processTransfer(makeTransfer())).rejects.toThrow(
        'DB connection lost',
      );

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });

    it('deve lançar BadRequestException se contas não forem encontradas durante a transação', async () => {
      authorizer.authorize.mockResolvedValue({
        success: true,
        authorized: true,
      });
      transfersRepository.save.mockImplementation(async (t) => t as Transfer);

      (queryRunner.manager.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.processTransfer(makeTransfer())).rejects.toThrow(
        'Accounts not found during transaction',
      );

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });
  });

  // ─── processScheduledTransfers() ────────────────────────────────────────────

  describe('processScheduledTransfers()', () => {
    it('não deve chamar processTransfer se não houver agendamentos para hoje', async () => {
      transfersRepository.lockBatch.mockResolvedValue([]);

      await service.processScheduledTransfers();

      expect(authorizer.authorize).not.toHaveBeenCalled();
    });

    it('deve chamar processTransfer para cada transferência agendada', async () => {
      const transfers = [makeTransfer({ id: 1 }), makeTransfer({ id: 2 })];

      transfersRepository.lockBatch
        .mockResolvedValueOnce(transfers) // primeira rodada
        .mockResolvedValueOnce([]); // encerra loop

      authorizer.authorize.mockResolvedValue({
        success: true,
        authorized: true,
      });

      transfersRepository.save.mockImplementation(async (t) => t as Transfer);

      (queryRunner.manager.findOne as jest.Mock).mockResolvedValue(
        makeAccount({ id: 1, balance: 9999 }),
      );
      (queryRunner.manager.save as jest.Mock).mockResolvedValue({});

      await service.processScheduledTransfers();

      expect(authorizer.authorize).toHaveBeenCalledTimes(2);
    });

    it('não deve lançar erro se uma transferência falhar — deve continuar as demais', async () => {
      const transfers = [makeTransfer({ id: 1 }), makeTransfer({ id: 2 })];

      transfersRepository.lockBatch
        .mockResolvedValueOnce(transfers)
        .mockResolvedValueOnce([]);

      authorizer.authorize
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({ success: true, authorized: false });

      transfersRepository.save.mockImplementation(async (t) => t as Transfer);

      await expect(service.processScheduledTransfers()).resolves.not.toThrow();

      expect(authorizer.authorize).toHaveBeenCalledTimes(2);
    });
  });

  // ─── findAll() ──────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('deve retornar todas as transferências', async () => {
      const transfers = [makeTransfer({ id: 1 }), makeTransfer({ id: 2 })];
      transfersRepository.findAll.mockResolvedValue(transfers);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(transfersRepository.findAll).toHaveBeenCalledTimes(1);
    });

    it('deve retornar array vazio quando não há transferências', async () => {
      transfersRepository.findAll.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });
});
