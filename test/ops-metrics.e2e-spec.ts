import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { PgLikePool } from '@simple-resume/sqlite-pg';
import supertest from 'supertest';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/bootstrap-app';
import { APP_DB } from '../src/database/app-db.token';

describe('Ops metrics (e2e)', () => {
  let app: INestApplication;
  const token = process.env.OPS_METRICS_TOKEN ?? '';

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

  it('无令牌时 GET /ops/metrics 返回 401', async () => {
    const from = '2026-01-01T00:00:00.000Z';
    const to = '2026-01-02T00:00:00.000Z';
    const res = await supertest(app.getHttpServer())
      .get(
        `/ops/metrics?taskType=export&from=${encodeURIComponent(
          from,
        )}&to=${encodeURIComponent(to)}`,
      )
      .expect(401);

    expect(res.body.error?.code).toBe('OPS_METRICS_UNAUTHORIZED');
    expect(res.body.requestId).toBeTruthy();
  });

  it('错误令牌返回 401', async () => {
    const from = '2026-01-01T00:00:00.000Z';
    const to = '2026-01-02T00:00:00.000Z';
    const res = await supertest(app.getHttpServer())
      .get(
        `/ops/metrics?taskType=export&from=${encodeURIComponent(
          from,
        )}&to=${encodeURIComponent(to)}`,
      )
      .set('Authorization', 'Bearer wrong-token')
      .expect(401);

    expect(res.body.error?.code).toBe('OPS_METRICS_UNAUTHORIZED');
  });

  it('正确令牌返回聚合结构（可含零计数）', async () => {
    const from = '2026-01-01T00:00:00.000Z';
    const to = '2026-01-02T00:00:00.000Z';
    const res = await supertest(app.getHttpServer())
      .get(
        `/ops/metrics?taskType=export&from=${encodeURIComponent(
          from,
        )}&to=${encodeURIComponent(to)}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.requestId).toBeTruthy();
    const data = res.body.data;
    expect(data.taskType).toBe('export');
    expect(data.window).toEqual({ from, to });
    expect(typeof data.successRate).toBe('number');
    expect(typeof data.failureRate).toBe('number');
    expect(data.statusCounts).toBeDefined();
    expect(Array.isArray(data.errorCodeCounts)).toBe(true);
  });

  it('时间范围超过 90 天返回 400', async () => {
    const from = '2025-01-01T00:00:00.000Z';
    const to = '2026-01-01T00:00:00.000Z';
    const res = await supertest(app.getHttpServer())
      .get(
        `/ops/metrics?taskType=polish&from=${encodeURIComponent(
          from,
        )}&to=${encodeURIComponent(to)}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    expect(res.body.error?.code).toBe('VALIDATION_FAILED');
    expect(res.body.requestId).toBeTruthy();
  });

  it('export 聚合含 failed 与 error_code（真实作业行）', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `ops-m-${Date.now()}@example.com`);

    const csrf1 = await agent.get('/auth/csrf').expect(200);
    const createRes = await agent
      .post('/resumes')
      .set('X-CSRF-Token', csrf1.body.data.csrfToken as string)
      .expect(201);
    const resumeId = createRes.body.data.resumeId as string;

    const csrf2 = await agent.get('/auth/csrf').expect(200);
    const postJob = await agent
      .post('/export-jobs')
      .set('X-CSRF-Token', csrf2.body.data.csrfToken as string)
      .send({ resumeId })
      .expect(201);
    const jobId = postJob.body.data.jobId as string;

    const pool = app.get<PgLikePool>(APP_DB);
    await pool.query(
      `UPDATE export_jobs SET status = 'failed', error_code = $2, error_message = $3, updated_at = now() WHERE id = $1`,
      [jobId, 'E_TEST', '（测试）'],
    );

    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 60 * 1000).toISOString();
    const res = await supertest(app.getHttpServer())
      .get(
        `/ops/metrics?taskType=export&from=${encodeURIComponent(
          from,
        )}&to=${encodeURIComponent(to)}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const data = res.body.data;
    expect(data.statusCounts.failed).toBeGreaterThanOrEqual(1);
    const row = data.errorCodeCounts.find(
      (x: { errorCode: string }) => x.errorCode === 'E_TEST',
    );
    expect(row?.count).toBeGreaterThanOrEqual(1);
  });
});
