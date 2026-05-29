import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CREDIT_ACTIONS,
  ERROR_CODES,
  type CreditAction,
  type UserCredits,
} from '../../contracts/index';
import { parseEnv } from '../../config/env.schema';
import { CreditsRepository } from './credits.repository';

@Injectable()
export class CreditsService {
  constructor(private readonly creditsRepository: CreditsRepository) {}

  getCost(action: CreditAction): number {
    const env = parseEnv(process.env);
    switch (action) {
      case CREDIT_ACTIONS.CHAT_MESSAGE:
        return env.CREDITS_COST_CHAT;
      case CREDIT_ACTIONS.IMPORT:
        return env.CREDITS_COST_IMPORT;
      case CREDIT_ACTIONS.CHAT_ASSIST:
        return env.CREDITS_COST_CHAT_ASSIST;
      default:
        return 1;
    }
  }

  getTrialInitial(): number {
    return parseEnv(process.env).TRIAL_CREDITS_INITIAL;
  }

  async getUsage(userId: string): Promise<UserCredits> {
    const row = await this.creditsRepository.getUserCredits(userId);
    if (!row) {
      throw new NotFoundException({
        code: ERROR_CODES.AUTH_REQUIRED,
        message: '用户不存在',
      });
    }
    return {
      balance: row.credits_balance,
      plan: row.plan,
      trialInitial: this.getTrialInitial(),
    };
  }

  async assertCanSpend(userId: string, action: CreditAction): Promise<void> {
    const usage = await this.getUsage(userId);
    if (usage.plan === 'subscribed') return;
    const cost = this.getCost(action);
    if (usage.balance < cost) {
      throw new HttpException(
        {
          code: ERROR_CODES.CREDITS_EXHAUSTED,
          message: '试用额度已用完，请订阅后继续使用',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  async spend(
    userId: string,
    action: CreditAction,
    refId?: string,
  ): Promise<UserCredits> {
    const usage = await this.getUsage(userId);
    if (usage.plan === 'subscribed') {
      return usage;
    }

    const cost = this.getCost(action);
    const balanceAfter = await this.creditsRepository.spendCredits(
      userId,
      cost,
      action,
      refId,
    );
    if (balanceAfter === undefined) {
      throw new HttpException(
        {
          code: ERROR_CODES.CREDITS_EXHAUSTED,
          message: '试用额度已用完，请订阅后继续使用',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return {
      balance: balanceAfter,
      plan: usage.plan,
      trialInitial: usage.trialInitial,
    };
  }
}
