import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Account } from 'src/modules/accounts/entities/account.entity';
import { Repository } from 'typeorm';

@Injectable()
export class AccountRepository {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
  ) {}

  async create(name: string): Promise<Account> {
    const account = this.accountRepository.create({ name, balance: 0 });
    return this.accountRepository.save(account);
  }

  async findById(id: number): Promise<Account | null> {
    return this.accountRepository.findOne({ where: { id } });
  }

  async findAll(): Promise<Account[]> {
    return this.accountRepository.find();
  }

  async save(account: Account): Promise<Account> {
    return this.accountRepository.save(account);
  }
}
