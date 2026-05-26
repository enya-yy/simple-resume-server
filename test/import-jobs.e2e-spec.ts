import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { PgLikePool } from '@simple-resume/sqlite-pg';
import supertest from 'supertest';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/bootstrap-app';
import { APP_DB } from '../src/database/app-db.token';
import { runImportJobStep } from '../src/worker/import-resume.worker';

describe('Import jobs (e2e)', () => {
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

  it('POST /import-jobs with rawText returns jobId and GET polls to succeeded', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `import-a-${Date.now()}@example.com`);

    const csrf = await agent.get('/auth/csrf').expect(200);
    const postJob = await agent
      .post('/import-jobs')
      .set('X-CSRF-Token', csrf.body.data.csrfToken as string)
      .field(
        'rawText',
        [
          '张三',
          'zhang@example.com',
          '13800138000',
          '工作经历',
          '某科技公司 · 后端工程师 · 2020-2024',
          '- 负责 API 开发',
        ].join('\n'),
      )
      .expect(201);

    expect(postJob.body.requestId).toBeTruthy();
    expect(postJob.body.data.jobId).toBeTruthy();
    expect(postJob.body.data.sessionId).toBeTruthy();
    const jobId = postJob.body.data.jobId as string;
    const resumeId = postJob.body.data.resumeId as string;

    const pool = app.get<PgLikePool>(APP_DB);
    await runImportJobStep(pool, jobId);

    const poll = await agent.get(`/import-jobs/${jobId}`).expect(200);
    expect(poll.body.data.status).toBe('succeeded');
    expect(poll.body.data.sessionId).toBeTruthy();

    const resume = await pool.query<{ document_json: unknown }>(
      `SELECT document_json FROM resumes WHERE id = $1`,
      [resumeId],
    );
    const doc = resume.rows[0]?.document_json as { basics?: { fullName?: string } };
    expect(doc?.basics?.fullName).toBeTruthy();
  });

  it('他人 jobId 的 GET 返回 403', async () => {
    const agentA = supertest.agent(app.getHttpServer());
    await registerAndLogin(agentA, `import-owner-${Date.now()}@example.com`);

    const csrf = await agentA.get('/auth/csrf').expect(200);
    const postJob = await agentA
      .post('/import-jobs')
      .set('X-CSRF-Token', csrf.body.data.csrfToken as string)
      .field('rawText', '张三\nzhang@example.com\n13800138000\n后端工程师经历若干')
      .expect(201);
    const jobId = postJob.body.data.jobId as string;

    const agentB = supertest.agent(app.getHttpServer());
    await registerAndLogin(agentB, `import-other-${Date.now()}@example.com`);

    const forbidden = await agentB.get(`/import-jobs/${jobId}`).expect(403);
    expect(forbidden.body.error.code).toBe('AUTH_FORBIDDEN');
  });
});
