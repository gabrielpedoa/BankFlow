import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Post,
} from '@nestjs/common';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransfersService } from './transfer.service';

@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateTransferDto) {
    const transfer = await this.transfersService.create(dto);
    return {
      message: dto.scheduled_at
        ? `Transfer scheduled for ${dto.scheduled_at}`
        : 'Transfer processed',
      data: transfer,
    };
  }

  @Get()
  async findAll() {
    const transfers = await this.transfersService.findAll();
    return { data: transfers };
  }
}
