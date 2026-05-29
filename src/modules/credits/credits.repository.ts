import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { PgLikePool, QueryResult } from '@simple-resume/sqlite-pg';
import type {
  AdminCreditReason,
  CreditAction,
  UserPlan,
} from '../../contracts/constants/credit-actions';
import { APP_DB } from '../../database/app-db.token';

export interface UserCreditsRow {
  credits_balance: number;
  plan: UserPlan;
}

export interface CreditLedgerRow {
  id: string;
  user_id: string;
  delta: number;
  reason: string;
  ref_id: string | null;
  balance_after: number;
  created_at: string;
}

@Injectable()
export class CreditsRepository {
  constructor(@Inject(APP_DB) private readonly pool: PgLikePool) {}

  async getUserCredits(userId: string): Promise<UserCreditsRow | undefined> {
    const r: QueryResult<UserCreditsRow> = await this.pool.query(
      `SELECT credits_balance, plan FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    return r.rows[0];
  }

  async spendCredits(
    userId: string,
    amount: number,
    reason: CreditAction,
    refId?: string,
  ): Promise<number | undefined> {
    return this.pool.transaction(async (client) => {
      const userR = await client.query<UserCreditsRow>(
        `SELECT credits_balance, plan FROM users WHERE id = $1 LIMIT 1`,
        [userId],
      );
      const user = userR.rows[0];
      if (!user) return undefined;
      if (user.plan === 'subscribed') {
        return user.credits_balance;
      }
      if (user.credits_balance < amount) {
        return undefined;
      }

      const nextBalance = user.credits_balance - amount;
      await client.query(
        `UPDATE users
         SET credits_balance = $1, updated_at = datetime('now')
         WHERE id = $2`,
        [nextBalance, userId],
      );
      await client.query(
        `INSERT INTO credit_ledger (id, user_id, delta, reason, ref_id, balance_after)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), userId, -amount, reason, refId ?? null, nextBalance],
      );
      return nextBalance;
    });
  }

  async adjustCredits(
    userId: string,
    delta: number,
    reason: AdminCreditReason,
    note?: string,
  ): Promise<number | undefined> {
    return this.pool.transaction(async (client) => {
      const userR = await client.query<{ credits_balance: number }>(
        `SELECT credits_balance FROM users WHERE id = $1 LIMIT 1`,
        [userId],
      );
      const user = userR.rows[0];
      if (!user) return undefined;

      const nextBalance = user.credits_balance + delta;
      if (nextBalance < 0) {
        return undefined;
      }

      await client.query(
        `UPDATE users
         SET credits_balance = $1, updated_at = datetime('now')
         WHERE id = $2`,
        [nextBalance, userId],
      );
      await client.query(
        `INSERT INTO credit_ledger (id, user_id, delta, reason, ref_id, balance_after)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          randomUUID(),
          userId,
          delta,
          reason,
          note?.trim() ? note.trim().slice(0, 200) : null,
          nextBalance,
        ],
      );
      return nextBalance;
    });
  }

  async listLedger(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<{ rows: CreditLedgerRow[]; total: number }> {
    const countR = await this.pool.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM credit_ledger WHERE user_id = $1`,
      [userId],
    );
    const total = Number(countR.rows[0]?.count ?? 0);
    const listR = await this.pool.query<CreditLedgerRow>(
      `SELECT id, user_id, delta, reason, ref_id, balance_after, created_at
       FROM credit_ledger
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    return { rows: listR.rows, total };
  }
}
