export interface AuthorizerPayload {
  sender: number;
  receiver: number;
  amount: number;
}

export interface AuthorizerResponse {
  success: boolean;
  authorized: boolean;
}

export interface IAuthorizer {
  authorize(payload: AuthorizerPayload): Promise<AuthorizerResponse>;
}

export const AUTHORIZER_TOKEN = 'AUTHORIZER_TOKEN';
