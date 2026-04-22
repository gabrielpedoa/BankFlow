import { AccountRepository } from '@accounts/account.repository';
import { Account } from '@accounts/entities/account.entity';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { TransfersRepository } from 'src/modules/transfer/transfer.repository';
import { DataSource } from 'typeorm';
import type { IAuthorizer } from './authorizer/authorizer.interface';
import { AUTHORIZER_TOKEN } from './authorizer/authorizer.interface';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { Transfer, TransferStatus } from './entities/transfer.entity';

@Injectable()
export class TransfersService {
  private readonly logger = new Logger(TransfersService.name);

  constructor(
    private readonly transfersRepository: TransfersRepository,
    private readonly accountsRepository: AccountRepository,
    @Inject(AUTHORIZER_TOKEN) private readonly authorizer: IAuthorizer,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateTransferDto): Promise<Transfer> {
    if (dto.sender_id === dto.receiver_id) {
      throw new BadRequestException(
        'Sender and receiver must be different accounts',
      );
    }

    const [sender, receiver] = await Promise.all([
      this.accountsRepository.findById(dto.sender_id),
      this.accountsRepository.findById(dto.receiver_id),
    ]);

    const errors: string[] = [];
    if (!sender) errors.push(`Sender account ${dto.sender_id} not found`);
    if (!receiver) errors.push(`Receiver account ${dto.receiver_id} not found`);
    if (errors.length) throw new BadRequestException(errors.join('. '));

    if (dto.idempotency_key) {
      const existing = await this.transfersRepository.findByIdempotencyKey(
        dto.idempotency_key,
      );
      if (existing) return existing;
    }

    const transfer = await this.transfersRepository.create({
      sender_id: dto.sender_id,
      receiver_id: dto.receiver_id,
      amount: dto.amount.toFixed(2),
      scheduled_at: dto.scheduled_at ? new Date(dto.scheduled_at) : null,
      status: TransferStatus.PENDING,
      idempotency_key: dto.idempotency_key ?? null,
    });

    if (!dto.scheduled_at) {
      await this.processTransfer(transfer);
    }

    return transfer;
  }

  async processTransfer(transfer: Transfer): Promise<Transfer> {
    if (transfer.status !== TransferStatus.PENDING) {
      this.logger.warn(
        `Transfer #${transfer.id} already processed or in progress`,
      );
      return transfer;
    }

    transfer.status = TransferStatus.PROCESSING;
    await this.transfersRepository.save(transfer);

    const authResult = await this.authorizer.authorize({
      sender: transfer.sender_id,
      receiver: transfer.receiver_id,
      amount: Number(transfer.amount),
    });

    if (!authResult.success || !authResult.authorized) {
      transfer.status = TransferStatus.UNAUTHORIZED;
      transfer.failure_reason = 'Transaction not authorized';
      return this.transfersRepository.save(transfer);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const [firstId, secondId] =
        transfer.sender_id < transfer.receiver_id
          ? [transfer.sender_id, transfer.receiver_id]
          : [transfer.receiver_id, transfer.sender_id];

      const sender = await queryRunner.manager.findOne(Account, {
        where: { id: firstId === transfer.sender_id ? firstId : secondId },
        lock: { mode: 'pessimistic_write' },
      });

      const receiver = await queryRunner.manager.findOne(Account, {
        where: { id: firstId === transfer.receiver_id ? firstId : secondId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!sender || !receiver) {
        throw new BadRequestException('Accounts not found during transaction');
      }

      const amount = Number(transfer.amount);

      if (Number(sender.balance) < amount) {
        transfer.status = TransferStatus.FAILED;
        transfer.failure_reason = 'Insufficient funds';
        await queryRunner.rollbackTransaction();
        return this.transfersRepository.save(transfer);
      }

      sender.balance = Number(sender.balance) - amount;
      receiver.balance = Number(receiver.balance) + amount;

      await queryRunner.manager.save(Account, sender);
      await queryRunner.manager.save(Account, receiver);

      transfer.status = TransferStatus.COMPLETED;
      transfer.failure_reason = null;
      transfer.processed_at = new Date();

      await queryRunner.manager.save(Transfer, transfer);

      await queryRunner.commitTransaction();

      this.logger.log(
        `Transfer #${transfer.id} completed: ${amount} from ${transfer.sender_id} to ${transfer.receiver_id}`,
      );

      return transfer;
    } catch (error: any) {
      await queryRunner.rollbackTransaction();

      transfer.status = TransferStatus.FAILED;
      transfer.failure_reason = error.message;

      await this.transfersRepository.save(transfer);

      this.logger.error(`Transfer #${transfer.id} failed: ${error.message}`);

      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async processScheduledTransfers(): Promise<void> {
    const scheduled = await this.transfersRepository.findScheduledForToday();
    this.logger.log(`Processing ${scheduled.length} scheduled transfer(s)`);
    await Promise.allSettled(
      scheduled.map((transfer) => this.processTransfer(transfer)),
    );
  }

  async findAll(): Promise<Transfer[]> {
    return this.transfersRepository.findAll();
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<Transfer | null> {
    return this.transfersRepository.findByIdempotencyKey(idempotencyKey);
  }
}
