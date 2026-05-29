import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PgLikePool } from '@simple-resume/sqlite-pg';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/bootstrap-app';
import { APP_DB } from '../src/database/app-db.token';

describe('Credits (e2e)', () => {
  let app: INestApplication;

  async function registerAndLogin(
    agent: ReturnType<typeof supertest.agent>,
    email: string,
  ) {
    const csrf = await agent.get('/auth/csrf').expect(200);
    await agent
      .post('/auth/register')
      .set('X-CSRF-Token', csrf.body.data.csrfToken as string)
      .send({ email, password: 'password12' })
      .expect(201);
  }

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await configureHttpApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('注册后 /auth/me 返回试用额度', async () => {
    const agent = supertest.agent(app.getHttpServer());
    const email = `credits-me-${Date.now()}@example.com`;
    await registerAndLogin(agent, email);

    const me = await agent.get('/auth/me').expect(200);
    expect(me.body.data.email).toBe(email.toLowerCase());
    expect(me.body.data.credits).toMatchObject({
      plan: 'trial',
      balance: expect.any(Number),
      trialInitial: expect.any(Number),
    });
    expect(me.body.data.credits.balance).toBeGreaterThan(0);
  });

  it('额度为 0 时发送对话返回 CREDITS_EXHAUSTED', async () => {
    const agent = supertest.agent(app.getHttpServer());
    const email = `credits-exhaust-${Date.now()}@example.com`;
    await registerAndLogin(agent, email);

    const me0 = await agent.get('/auth/me').expect(200);
    const userId = me0.body.data.id as string;

    const pool = app.get<PgLikePool>(APP_DB);
    await pool.query(
      `UPDATE users SET credits_balance = 0 WHERE id = $1`,
      [userId],
    );

    const csrf = await agent.get('/auth/csrf').expect(200);
    const csrfToken = csrf.body.data.csrfToken as string;

    const resume = await agent
      .post('/resumes')
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(201);
    const sessionId = resume.body.data.sessionId as string;

    const blocked = await agent
      .post(`/chat-sessions/${sessionId}/messages`)
      .set('X-CSRF-Token', csrfToken)
      .send({ content: '额度应该不够了' })
      .expect(402);

    expect(blocked.body.error.code).toBe('CREDITS_EXHAUSTED');
  });
});
