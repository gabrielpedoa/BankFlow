
import { Account } from '@accounts/entities/account.entity';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AccountRepository } from './account.repository';
import { AccountsService } from './accounts.service';

const makeAccount = (overrides: Partial<Account> = {}): Account =>
  ({
    id: 1,
    name: 'Alice',
    balance: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Account;

describe('AccountsService', () => {
  let service: AccountsService;
  let repository: jest.Mocked<AccountRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        {
          provide: AccountRepository,
          useValue: {
            create: jest.fn(),
            findById: jest.fn(),
            findAll: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(AccountsService);
    repository = module.get(AccountRepository);
  });

  describe('create()', () => {
    it('deve criar e retornar uma conta com saldo 0', async () => {
      const account = makeAccount({ name: 'Alice', balance: 0 });
      repository.create.mockResolvedValue(account);

      const result = await service.create({ name: 'Alice' });

      expect(repository.create).toHaveBeenCalledWith('Alice');
      expect(result.balance).toBe(0);
      expect(result.name).toBe('Alice');
    });

    it('deve propagar erro do repositório', async () => {
      repository.create.mockRejectedValue(new Error('DB error'));

      await expect(service.create({ name: 'Alice' })).rejects.toThrow(
        'DB error',
      );
    });
  });

  describe('findAll()', () => {
    it('deve retornar lista de contas', async () => {
      const accounts = [
        makeAccount({ id: 1 }),
        makeAccount({ id: 2, name: 'Bob' }),
      ];
      repository.findAll.mockResolvedValue(accounts);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(repository.findAll).toHaveBeenCalledTimes(1);
    });

    it('deve retornar array vazio quando não há contas', async () => {
      repository.findAll.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findByIdOrFail()', () => {
    it('deve retornar a conta quando ela existe', async () => {
      const account = makeAccount({ id: 5 });
      repository.findById.mockResolvedValue(account);

      const result = await service.findByIdOrFail(5);

      expect(result).toEqual(account);
      expect(repository.findById).toHaveBeenCalledWith(5);
    });

    it('deve lançar NotFoundException quando conta não existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findByIdOrFail(99)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
