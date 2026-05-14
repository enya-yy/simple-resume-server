import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { PgLikePool } from '@simple-resume/sqlite-pg';
import supertest from 'supertest';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/bootstrap-app';
import { APP_DB } from '../src/database/app-db.token';

describe('Export jobs (e2e)', () => {
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

  it('POST /export-jobs 返回 jobId 与 requestId；GET 轮询可见状态迁移', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `export-a-${Date.now()}@example.com`);

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

    expect(postJob.body.requestId).toBeTruthy();
    expect(postJob.body.data.jobId).toBeTruthy();
    const jobId = postJob.body.data.jobId as string;

    const poll1 = await agent.get(`/export-jobs/${jobId}`).expect(200);
    expect(['queued', 'running', 'succeeded']).toContain(
      poll1.body.data.status,
    );

    const pool = app.get<PgLikePool>(APP_DB);
    await pool.query(
      `UPDATE export_jobs SET status = 'running', updated_at = now() WHERE id = $1`,
      [jobId],
    );
    const poll2 = await agent.get(`/export-jobs/${jobId}`).expect(200);
    expect(poll2.body.data.status).toBe('running');

    await pool.query(
      `UPDATE export_jobs SET status = 'succeeded', updated_at = now() WHERE id = $1`,
      [jobId],
    );
    const poll3 = await agent.get(`/export-jobs/${jobId}`).expect(200);
    expect(poll3.body.data.status).toBe('succeeded');
  });

  it('GET succeeded 且存在 artifact 时返回 downloadUrl 与 TTL（stub）', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `export-dl-${Date.now()}@example.com`);

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
    const key = `users/00000000-0000-0000-0000-000000000001/resumes/${resumeId}/exports/${jobId}.pdf`;
    await pool.query(
      `UPDATE export_jobs SET status = 'succeeded', artifact_object_key = $2, artifact_content_type = 'application/pdf',
       artifact_size_bytes = 12, completed_at = now(), updated_at = now() WHERE id = $1`,
      [jobId, key],
    );

    const poll = await agent.get(`/export-jobs/${jobId}`).expect(200);
    expect(poll.body.data.status).toBe('succeeded');
    expect(poll.body.data.downloadUrl).toMatch(/^https:\/\//);
    expect(poll.body.data.downloadUrlExpiresInSeconds).toBeGreaterThan(0);
    expect(poll.body.requestId).toBeTruthy();
  });

  it('他人 jobId 的 GET 返回 403', async () => {
    const agentA = supertest.agent(app.getHttpServer());
    await registerAndLogin(agentA, `export-owner-${Date.now()}@example.com`);

    const csrfA1 = await agentA.get('/auth/csrf').expect(200);
    const createRes = await agentA
      .post('/resumes')
      .set('X-CSRF-Token', csrfA1.body.data.csrfToken as string)
      .expect(201);
    const resumeId = createRes.body.data.resumeId as string;

    const csrfA2 = await agentA.get('/auth/csrf').expect(200);
    const postJob = await agentA
      .post('/export-jobs')
      .set('X-CSRF-Token', csrfA2.body.data.csrfToken as string)
      .send({ resumeId })
      .expect(201);
    const jobId = postJob.body.data.jobId as string;

    const agentB = supertest.agent(app.getHttpServer());
    await registerAndLogin(agentB, `export-other-${Date.now()}@example.com`);

    const forbidden = await agentB.get(`/export-jobs/${jobId}`).expect(403);
    expect(forbidden.body.error.code).toBe('AUTH_FORBIDDEN');
    expect(forbidden.body.requestId).toBeTruthy();
  });

  it('失败态 GET 返回 error 字段且含 requestId（信封）', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `export-fail-${Date.now()}@example.com`);

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
      [jobId, 'MOCK_FAIL', '模拟导出失败'],
    );

    const poll = await agent.get(`/export-jobs/${jobId}`).expect(200);
    expect(poll.body.data.status).toBe('failed');
    expect(poll.body.data.errorMessage).toBe('模拟导出失败');
    expect(poll.body.requestId).toBeTruthy();
  });

  it('无 CSRF 的 POST /export-jobs 返回 CSRF 错误', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `export-csrf-${Date.now()}@example.com`);

    const csrf1 = await agent.get('/auth/csrf').expect(200);
    const createRes = await agent
      .post('/resumes')
      .set('X-CSRF-Token', csrf1.body.data.csrfToken as string)
      .expect(201);
    const resumeId = createRes.body.data.resumeId as string;

    await agent
      .post('/export-jobs')
      .send({ resumeId })
      .expect(403)
      .expect((res) => {
        expect(res.body.error.code).toBe('CSRF_INVALID');
        expect(res.body.requestId).toBeTruthy();
      });
  });
});
