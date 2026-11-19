import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';

@Injectable()
export class PasswordService {
  constructor(private readonly config: ConfigService) {}

  hash(plain: string) {
    return bcrypt.hash(
      plain,
      this.config.get<number>('BCRYPT_SALT_ROUNDS') ?? 10,
    );
  }

  compare(plain: string, hash: string) {
    return bcrypt.compare(plain, hash);
  }
}
