import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Length,
} from 'class-validator';

export class CreateTransferDto {
  @IsInt()
  @IsPositive()
  @IsNotEmpty()
  sender_id: number;

  @IsInt()
  @IsPositive()
  @IsNotEmpty()
  receiver_id: number;

  @IsPositive()
  @IsNotEmpty()
  amount: number;

  @IsOptional()
  @IsDateString()
  scheduled_at?: string;

  @IsOptional()
  @IsString()
  @Length(10, 100)
  idempotency_key?: string;
}
