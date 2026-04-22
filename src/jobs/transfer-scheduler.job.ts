import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TransfersService } from 'src/modules/transfer/transfer.service';

@Injectable()
export class TransfersScheduler {
  private readonly logger = new Logger(TransfersScheduler.name);

  constructor(private readonly transfersService: TransfersService) {}

  @Cron('0 5 * * *', { name: 'process-scheduled-transfers' })
  async handleScheduledTransfers(): Promise<void> {
    this.logger.log('Starting scheduled transfers processing...');
    await this.transfersService.processScheduledTransfers();
    this.logger.log('Scheduled transfers processing finished.');
  }
}
