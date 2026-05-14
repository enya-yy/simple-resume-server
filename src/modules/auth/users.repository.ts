import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { PgLikePool, QueryResult } from '@simple-resume/sqlite-pg';
import { APP_DB } from '../../database/app-db.token';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class UsersRepository {
  constructor(@Inject(APP_DB) private readonly pool: PgLikePool) {}

  async findByEmail(email: string): Promise<UserRow | undefined> {
    const r: QueryResult<UserRow> = await this.pool.query(
      `SELECT id, email, password_hash, created_at, updated_at
       FROM users WHERE email = $1 LIMIT 1`,
      [email.toLowerCase()],
    );
    return r.rows[0];
  }

  async create(email: string, passwordHash: string): Promise<UserRow> {
    const id = randomUUID();
    const r: QueryResult<UserRow> = await this.pool.query(
      `INSERT INTO users (id, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, password_hash, created_at, updated_at`,
      [id, email.toLowerCase(), passwordHash],
    );
    return r.rows[0]!;
  }

  async findById(id: string): Promise<UserRow | undefined> {
    const r: QueryResult<UserRow> = await this.pool.query(
      `SELECT id, email, password_hash, created_at, updated_at
       FROM users WHERE id = $1 LIMIT 1`,
      [id],
    );
    return r.rows[0];
  }
}
