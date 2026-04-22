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

  async lockBatch(limit: number): Promise<Transfer[]> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const transfers = await this.repo.find({
      where: {
        scheduled_at: Between(start, end),
        status: TransferStatus.PENDING,
      },
      order: { id: 'ASC' },
      take: limit,
    });

    return transfers;
  }

  async findAll(): Promise<Transfer[]> {
    return this.repo.find({ relations: ['sender', 'receiver'] });
  }
}
