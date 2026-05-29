import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { PgLikePool, QueryResult } from '@simple-resume/sqlite-pg';
import type { UserPlan } from '../../contracts/constants/credit-actions';
import type { UserRole } from '../../contracts/constants/user-roles';
import { APP_DB } from '../../database/app-db.token';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  credits_balance: number;
  plan: UserPlan;
  role: UserRole;
  disabled_at: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AdminUserListRow {
  id: string;
  email: string;
  role: UserRole;
  plan: UserPlan;
  credits_balance: number;
  disabled_at: string | null;
  created_at: string;
  updated_at: string;
}

const USER_COLUMNS = `id, email, password_hash, credits_balance, plan, role, disabled_at, created_at, updated_at`;

@Injectable()
export class UsersRepository {
  constructor(@Inject(APP_DB) private readonly pool: PgLikePool) {}

  async findByEmail(email: string): Promise<UserRow | undefined> {
    const r: QueryResult<UserRow> = await this.pool.query(
      `SELECT ${USER_COLUMNS} FROM users WHERE email = $1 LIMIT 1`,
      [email.toLowerCase()],
    );
    return r.rows[0];
  }

  async create(
    email: string,
    passwordHash: string,
    creditsBalance: number,
  ): Promise<UserRow> {
    const id = randomUUID();
    const r: QueryResult<UserRow> = await this.pool.query(
      `INSERT INTO users (id, email, password_hash, credits_balance, plan, role)
       VALUES ($1, $2, $3, $4, 'trial', 'user')
       RETURNING ${USER_COLUMNS}`,
      [id, email.toLowerCase(), passwordHash, creditsBalance],
    );
    return r.rows[0]!;
  }

  async findById(id: string): Promise<UserRow | undefined> {
    const r: QueryResult<UserRow> = await this.pool.query(
      `SELECT ${USER_COLUMNS} FROM users WHERE id = $1 LIMIT 1`,
      [id],
    );
    return r.rows[0];
  }

  async isDisabled(userId: string): Promise<boolean> {
    const r = await this.pool.query<{ disabled_at: string | null }>(
      `SELECT disabled_at FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    return r.rows[0]?.disabled_at != null;
  }

  async listUsers(params: {
    q?: string;
    limit: number;
    offset: number;
  }): Promise<{ rows: AdminUserListRow[]; total: number }> {
    const { q, limit, offset } = params;
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (q?.trim()) {
      values.push(`%${q.trim().toLowerCase()}%`);
      conditions.push(`email LIKE $${values.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countR = await this.pool.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM users ${where}`,
      values,
    );
    const total = Number(countR.rows[0]?.count ?? 0);

    values.push(limit, offset);
    const listR = await this.pool.query<AdminUserListRow>(
      `SELECT id, email, role, plan, credits_balance, disabled_at, created_at, updated_at
       FROM users ${where}
       ORDER BY created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return { rows: listR.rows, total };
  }

  async findAdminListItem(id: string): Promise<AdminUserListRow | undefined> {
    const r = await this.pool.query<AdminUserListRow>(
      `SELECT id, email, role, plan, credits_balance, disabled_at, created_at, updated_at
       FROM users WHERE id = $1 LIMIT 1`,
      [id],
    );
    return r.rows[0];
  }

  async setPlan(userId: string, plan: UserPlan): Promise<boolean> {
    const r = await this.pool.query(
      `UPDATE users SET plan = $1, updated_at = datetime('now') WHERE id = $2`,
      [plan, userId],
    );
    return (r.rowCount ?? 0) > 0;
  }

  async setDisabled(userId: string, disabled: boolean): Promise<boolean> {
    const r = await this.pool.query(
      disabled
        ? `UPDATE users SET disabled_at = datetime('now'), updated_at = datetime('now') WHERE id = $1 AND disabled_at IS NULL`
        : `UPDATE users SET disabled_at = NULL, updated_at = datetime('now') WHERE id = $1 AND disabled_at IS NOT NULL`,
      [userId],
    );
    return (r.rowCount ?? 0) > 0;
  }
}
