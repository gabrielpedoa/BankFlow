import { AccountsModule } from '@accounts/accounts.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AUTHORIZER_TOKEN } from './authorizer/authorizer.interface';
import { ExternalAuthorizerService } from './authorizer/external.authorizer';
import { Transfer } from './entities/transfer.entity';
import { TransfersController } from './transfer.controller';
import { TransfersRepository } from './transfer.repository';
import { TransfersService } from './transfer.service';

@Module({
  imports: [TypeOrmModule.forFeature([Transfer]), AccountsModule],
  providers: [
    TransfersService,
    TransfersRepository,
    {
      provide: AUTHORIZER_TOKEN,
      useClass: ExternalAuthorizerService,
    },
  ],
  controllers: [TransfersController],
  exports: [TransfersService],
})
export class TransferModule {}
