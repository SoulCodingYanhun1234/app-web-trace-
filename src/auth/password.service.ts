import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import bcrypt from 'bcryptjs';

@Injectable()
export class PasswordService {
  async hash(password: string) {
    const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
    return bcrypt.hash(password, rounds);
  }

  async verify(hash: string, password: string) {
    if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
      return bcrypt.compare(password, hash);
    }
    // 兼容历史 argon2 密码，用户修改密码后会自动变为 bcrypt。
    return argon2.verify(hash, password);
  }
}
