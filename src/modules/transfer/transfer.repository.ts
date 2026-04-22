import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Transfer,
  TransferStatus,
} from 'src/modules/transfer/entities/transfer.entity';
import { Between, Repository } from 'typeorm';

@Injectable()
export class TransfersRepository {
  constructor(
    @InjectRepository(Transfer)
    private readonly repo: Repository<Transfer>,
  ) {}

  async create(data: Partial<Transfer>): Promise<Transfer> {
    const transfer = this.repo.create(data);
    return this.repo.save(transfer);
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<Transfer | null> {
    return this.repo.findOne({
      where: {
        idempotency_key: idempotencyKey,
      },
    });
  }

  async save(transfer: Transfer): Promise<Transfer> {
    return this.repo.save(transfer);
  }

  async findScheduledForToday(): Promise<Transfer[]> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return this.repo.find({
      where: {
        scheduled_at: Between(start, end),
        status: TransferStatus.PENDING,
      },
    });
  }

  async findAll(): Promise<Transfer[]> {
    return this.repo.find({ relations: ['sender', 'receiver'] });
  }
}
