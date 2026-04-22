import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  AuthorizerPayload,
  AuthorizerResponse,
  IAuthorizer,
} from './authorizer.interface';

@Injectable()
export class ExternalAuthorizerService implements IAuthorizer {
  private readonly logger = new Logger(ExternalAuthorizerService.name);

  constructor(private readonly configService: ConfigService) {}

  async authorize(payload: AuthorizerPayload): Promise<AuthorizerResponse> {
    console.log(payload)
    const url = this.configService.get<string>('AUTHORIZER_URL');
    const email = this.configService.get<string>('EMAIL_BASE64');

    const headers = {
      headers: {
        Authorization: `Bearer ${Buffer.from(email!).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      timeout: 5000,
    };

    try {
      const response = await axios.post(url!, payload, headers);
      return response.data;
    } catch (error: any) {
      this.logger.warn(
        `External authorizer unavailable: ${error.message}. Using fallback.`,
      );

      return { success: true, authorized: true };
    }
  }
}
