import { AccountsService } from '@accounts/accounts.service';
import { CreateAccountDto } from '@accounts/dto/create-account.dto';
import { NestFactory } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { AppModule } from '../app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const accountsService = app.get(AccountsService);

  const [, , command, ...args] = process.argv;

  switch (command) {
    case 'create-account':
      await handleCreateAccount(accountsService, args);
      break;

    case 'list-accounts':
      await handleListAccounts(accountsService);
      break;

    default:
      showHelp();
  }

  await app.close();
}

bootstrap().catch((err) => {
  console.error('CLI Error:', err.message);
  process.exit(1);
});

async function validateOrExit<T extends object>(
  dtoClass: new () => T,
  data: { name: string },
): Promise<T> {
  const dto = plainToInstance(dtoClass, data);

  try {
    await validateOrReject(dto);
    return dto;
  } catch (errors: any) {
    console.error('\n❌ Validation failed:\n');

    errors.forEach((err) => {
      if (err.constraints) {
        console.error(`- ${Object.values(err.constraints).join(', ')}`);
      }
    });

    console.log();
    process.exit(1);
  }
}

async function handleCreateAccount(
  accountsService: AccountsService,
  args: string[],
) {
  const name = args.join(' ').trim();

  if (!name) {
    console.error('Error: please provide a name.');
    console.error('Usage: npm run cli -- create-account "John Doe"');
    process.exit(1);
  }

  const dto = await validateOrExit(CreateAccountDto, { name });

  const account = await accountsService.create(dto);

  console.log('\n✅ Account created successfully!');
  console.log(`   ID:      ${account.id}`);
  console.log(`   Name:    ${account.name}`);
  console.log(`   Balance: R$ ${Number(account.balance).toFixed(2)}\n`);
}

async function handleListAccounts(accountsService: AccountsService) {
  const accounts = await accountsService.findAll();

  if (accounts.length === 0) {
    console.log('\nNo accounts found.\n');
    return;
  }

  console.log('\n📋 Accounts:\n');

  accounts.forEach((acc) => {
    console.log(
      `   [${acc.id}] ${acc.name} — R$ ${Number(acc.balance).toFixed(2)}`,
    );
  });

  console.log();
}

function showHelp() {
  console.log('\nAvailable commands:');
  console.log(
    '  npm run cli -- create-account "Name"   Create a new bank account',
  );
  console.log('  npm run cli -- list-accounts           List all accounts\n');
  process.exit(1);
}
