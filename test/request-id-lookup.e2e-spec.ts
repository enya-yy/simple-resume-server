import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { PgLikePool } from '@simple-resume/sqlite-pg';
import supertest from 'supertest';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/bootstrap-app';
import { APP_DB } from '../src/database/app-db.token';

describe('Request ID lookup (e2e)', () => {
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

  it('无令牌时 GET /ops/request-id/:id 返回 401', async () => {
    const res = await supertest(app.getHttpServer())
      .get('/ops/request-id/550e8400-e29b-41d4-a716-446655440000')
      .expect(401);

    expect(res.body.error?.code).toBe('OPS_METRICS_UNAUTHORIZED');
    expect(res.body.requestId).toBeTruthy();
  });

  it('不存在的 requestId 返回 404 REQUEST_ID_NOT_FOUND', async () => {
    const res = await supertest(app.getHttpServer())
      .get('/ops/request-id/550e8400-e29b-41d4-a716-446655440000')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    expect(res.body.error?.code).toBe('REQUEST_ID_NOT_FOUND');
    expect(res.body.requestId).toBeTruthy();
  });

  it('创建导出作业后可通过 requestId 查回', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `rid-e2e-${Date.now()}@example.com`);

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
    const createRequestId = postJob.body.requestId as string;
    expect(createRequestId).toBeTruthy();

    const pool = app.get<PgLikePool>(APP_DB);
    await pool.query(
      `UPDATE export_jobs SET status = 'failed', error_code = $2, updated_at = now() WHERE id = $1`,
      [jobId, 'E_LOOKUP_TEST'],
    );

    const lookupRes = await supertest(app.getHttpServer())
      .get(`/ops/request-id/${createRequestId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const data = lookupRes.body.data;
    expect(data.found).toBe(true);
    expect(data.requestId).toBe(createRequestId);
    expect(data.jobs).toHaveLength(1);
    expect(data.jobs[0].jobId).toBe(jobId);
    expect(data.jobs[0].jobType).toBe('export');
    expect(data.jobs[0].status).toBe('failed');
    expect(data.jobs[0].errorCode).toBe('E_LOOKUP_TEST');
    expect(data.occurredAt).toBeTruthy();

    // Verify no content fields leak
    const raw = JSON.stringify(data);
    expect(raw).not.toContain('document_json');
    expect(raw).not.toContain('original_text');
    expect(raw).not.toContain('polished_text');
    expect(raw).not.toContain('error_message');
  });

  it('创建润色作业后可通过 requestId 查回', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `rid-e2e-polish-${Date.now()}@example.com`);

    const csrf1 = await agent.get('/auth/csrf').expect(200);
    const createRes = await agent
      .post('/resumes')
      .set('X-CSRF-Token', csrf1.body.data.csrfToken as string)
      .expect(201);
    const resumeId = createRes.body.data.resumeId as string;

    const csrf2 = await agent.get('/auth/csrf').expect(200);
    await agent
      .patch(`/resumes/${resumeId}`)
      .set('X-CSRF-Token', csrf2.body.data.csrfToken as string)
      .send({
        document: {
          templateId: 'classic-list',
          layoutOptions: {
            fontSizeStep: 1,
            pageMargin: 'standard',
            bodyLineHeight: 'normal',
          },
          basics: {
            fullName: 'Ada',
            email: 'ada@example.com',
            phone: '',
            location: '',
            headline: '',
            summary: '',
          },
          sections: [
            {
              id: 'm-1',
              type: 'experience',
              title: '经历',
              order: 0,
              items: [{ id: 'i-1', title: '工程师', bullets: ['做了 A'] }],
            },
          ],
        },
      })
      .expect(200);

    const csrf3 = await agent.get('/auth/csrf').expect(200);
    const postJob = await agent
      .post('/polish-jobs')
      .set('X-CSRF-Token', csrf3.body.data.csrfToken as string)
      .send({
        resumeId,
        target: { moduleId: 'm-1', itemId: 'i-1' },
      })
      .expect(201);
    const jobId = postJob.body.data.jobId as string;
    const createRequestId = postJob.body.requestId as string;
    expect(createRequestId).toBeTruthy();

    const pool = app.get<PgLikePool>(APP_DB);
    await pool.query(
      `UPDATE polish_jobs SET status = 'failed', error_code = $2, updated_at = now() WHERE id = $1`,
      [jobId, 'POLISH_LOOKUP_TEST'],
    );

    const lookupRes = await supertest(app.getHttpServer())
      .get(`/ops/request-id/${createRequestId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const data = lookupRes.body.data;
    expect(data.found).toBe(true);
    expect(data.requestId).toBe(createRequestId);
    expect(
      data.jobs.some((j: any) => j.jobId === jobId && j.jobType === 'polish'),
    ).toBe(true);
  });
});
