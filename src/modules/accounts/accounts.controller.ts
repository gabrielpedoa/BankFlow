import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateAccountDto) {
    const account = await this.accountsService.create(dto);
    return {
      message: 'Account created successfully',
      data: account,
    };
  }

  @Get()
  async findAll() {
    const accounts = await this.accountsService.findAll();
    return {
      data: accounts,
    };
  }
}
