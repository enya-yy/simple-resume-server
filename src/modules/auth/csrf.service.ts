import { Injectable } from '@nestjs/common';
import Tokens from 'csrf';

@Injectable()
export class CsrfService {
  private readonly tokens = new Tokens();

  createSecret(): string {
    return this.tokens.secretSync();
  }

  createToken(secret: string): string {
    return this.tokens.create(secret);
  }

  verify(secret: string, token: string | undefined): boolean {
    if (!token) return false;
    return this.tokens.verify(secret, token);
  }
}
