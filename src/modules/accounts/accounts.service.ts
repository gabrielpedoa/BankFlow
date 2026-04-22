import { Injectable, NotFoundException } from '@nestjs/common';
import { AccountRepository } from '@accounts/account.repository';
import { CreateAccountDto } from './dto/create-account.dto';
import { Account } from './entities/account.entity';

@Injectable()
export class AccountsService {
  constructor(private readonly accountsRepository: AccountRepository) {}

  async create(dto: CreateAccountDto): Promise<Account> {
    return this.accountsRepository.create(dto.name);
  }

  async findAll(): Promise<Account[]> {
    return this.accountsRepository.findAll();
  }

  async findByIdOrFail(id: number): Promise<Account> {
    const account = await this.accountsRepository.findById(id);
    if (!account)
      throw new NotFoundException(`Account with id ${id} not found`);

    return account;
  }
}
