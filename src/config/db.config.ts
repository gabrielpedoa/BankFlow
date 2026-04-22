import { Account } from '@accounts/entities/account.entity';
import { Transfer } from 'src/modules/transfer/entities/transfer.entity';

export const dbConfig = {
  type: 'mysql' as const,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT!) || 3306,
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'bankflow',
  entities: [Account, Transfer],
  synchronize: true,
};
