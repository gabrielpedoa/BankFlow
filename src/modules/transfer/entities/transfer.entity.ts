import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Account } from '../../accounts/entities/account.entity';

export enum TransferStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  UNAUTHORIZED = 'unauthorized',
}

@Entity('transfers')
export class Transfer {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'sender_id' })
  sender: Account;

  @Index()
  @Column()
  sender_id: number;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'receiver_id' })
  receiver: Account;

  @Index()
  @Column()
  receiver_id: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: string;

  @Index()
  @Column({ type: 'varchar', default: TransferStatus.PENDING })
  status: TransferStatus;

  @Index()
  @Column({ type: 'datetime', nullable: true })
  scheduled_at: Date | null;

  @Column({ type: 'text', nullable: true })
  failure_reason: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', nullable: true })
  idempotency_key: string | null;

  @Column({ type: 'timestamp', nullable: true })
  processed_at: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
