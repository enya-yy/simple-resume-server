import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PgLikePool } from '@simple-resume/sqlite-pg';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/bootstrap-app';
import { APP_DB } from '../src/database/app-db.token';

describe('Admin (e2e)', () => {
  let app: INestApplication;

  async function register(
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

  async function promoteAdmin(pool: PgLikePool, email: string) {
    await pool.query(`UPDATE users SET role = 'admin' WHERE email = $1`, [
      email.toLowerCase(),
    ]);
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

  it('非管理员访问 /admin/users 返回 403', async () => {
    const agent = supertest.agent(app.getHttpServer());
    const email = `admin-deny-${Date.now()}@example.com`;
    await register(agent, email);

    await agent.get('/admin/users').expect(403);
  });

  it('管理员可列表、查看、改 plan、调积分、禁用用户', async () => {
    const agent = supertest.agent(app.getHttpServer());
    const pool = app.get<PgLikePool>(APP_DB);
    const adminEmail = `admin-${Date.now()}@example.com`;
    const userEmail = `target-${Date.now()}@example.com`;

    await register(agent, adminEmail);
    await promoteAdmin(pool, adminEmail);

    const csrfAdmin = await agent.get('/auth/csrf').expect(200);
    const adminCsrf = csrfAdmin.body.data.csrfToken as string;

    const agent2 = supertest.agent(app.getHttpServer());
    await register(agent2, userEmail);
    const me2 = await agent2.get('/auth/me').expect(200);
    const targetId = me2.body.data.id as string;

    const list = await agent.get('/admin/users?q=target').expect(200);
    expect(list.body.data.items.length).toBeGreaterThanOrEqual(1);

    const detail = await agent.get(`/admin/users/${targetId}`).expect(200);
    expect(detail.body.data.email).toBe(userEmail.toLowerCase());
    expect(detail.body.data.createdAt).toMatch(/Z$/);
    expect(detail.body.data.lastAccessAt).toMatch(/Z$/);

    const patched = await agent
      .patch(`/admin/users/${targetId}`)
      .set('X-CSRF-Token', adminCsrf)
      .send({ plan: 'subscribed' })
      .expect(200);
    expect(patched.body.data.plan).toBe('subscribed');

    const adjusted = await agent
      .post(`/admin/users/${targetId}/credits/adjust`)
      .set('X-CSRF-Token', adminCsrf)
      .send({ delta: 10, note: 'e2e grant' })
      .expect(201);
    expect(adjusted.body.data.balance).toBeGreaterThanOrEqual(10);

    const ledger = await agent
      .get(`/admin/users/${targetId}/credits/ledger`)
      .expect(200);
    expect(ledger.body.data.items.length).toBeGreaterThanOrEqual(1);

    await agent
      .patch(`/admin/users/${targetId}`)
      .set('X-CSRF-Token', adminCsrf)
      .send({ disabled: true })
      .expect(200);

    const meBlocked = await agent2.get('/auth/me').expect(401);
    expect(meBlocked.body.error.code).toBe('AUTH_ACCOUNT_DISABLED');
  });

  it('禁用账号无法登录', async () => {
    const pool = app.get<PgLikePool>(APP_DB);
    const email = `disabled-${Date.now()}@example.com`;
    const agent = supertest.agent(app.getHttpServer());
    await register(agent, email);

    const me = await agent.get('/auth/me').expect(200);
    const userId = me.body.data.id as string;
    await pool.query(
      `UPDATE users SET disabled_at = datetime('now') WHERE id = $1`,
      [userId],
    );

    const csrf = await agent.get('/auth/csrf').expect(200);
    const login = await agent
      .post('/auth/login')
      .set('X-CSRF-Token', csrf.body.data.csrfToken as string)
      .send({ email, password: 'password12' })
      .expect(401);
    expect(login.body.error.code).toBe('AUTH_ACCOUNT_DISABLED');
  });
});
