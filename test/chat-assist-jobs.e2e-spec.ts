import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { CHAT_ASSIST_JOB_ERROR_CODES } from '../src/contracts/index';
import { randomUUID } from 'node:crypto';
import type { PgLikePool } from '@simple-resume/sqlite-pg';
import supertest from 'supertest';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/bootstrap-app';
import { APP_DB } from '../src/database/app-db.token';

describe('Chat assist jobs (e2e)', () => {
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

  it('POST /chat-assist-jobs 返回 jobId 与 requestId；GET 可见 queued', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `ca-a-${Date.now()}@example.com`);

    const csrf1 = await agent.get('/auth/csrf').expect(200);
    const createRes = await agent
      .post('/resumes')
      .set('X-CSRF-Token', csrf1.body.data.csrfToken as string)
      .expect(201);
    const resumeId = createRes.body.data.resumeId as string;

    const csrf3 = await agent.get('/auth/csrf').expect(200);
    const postJob = await agent
      .post('/chat-assist-jobs')
      .set('X-CSRF-Token', csrf3.body.data.csrfToken as string)
      .send({
        resumeId,
        assistKind: 'basics',
        targetHint: 'fullName',
      })
      .expect(201);

    expect(postJob.body.requestId).toBeTruthy();
    expect(postJob.body.data.jobId).toBeTruthy();
    const jobId = postJob.body.data.jobId as string;

    const poll = await agent.get(`/chat-assist-jobs/${jobId}`).expect(200);
    expect(['queued', 'running', 'succeeded', 'failed']).toContain(
      poll.body.data.status,
    );
    expect(poll.body.data.assistKind).toBe('basics');
    expect(poll.body.requestId).toBeTruthy();
  });

  it('GET 不存在的 jobId 返回 CHAT_ASSIST_JOB_NOT_FOUND', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `ca-nf-${Date.now()}@example.com`);

    const fakeId = randomUUID();
    const res = await agent.get(`/chat-assist-jobs/${fakeId}`).expect(404);
    expect(res.body.error.code).toBe('CHAT_ASSIST_JOB_NOT_FOUND');
    expect(res.body.requestId).toBeTruthy();
  });

  it('他人 jobId 的 GET 返回 403', async () => {
    const agentA = supertest.agent(app.getHttpServer());
    await registerAndLogin(agentA, `ca-owner-${Date.now()}@example.com`);

    const csrfA1 = await agentA.get('/auth/csrf').expect(200);
    const createRes = await agentA
      .post('/resumes')
      .set('X-CSRF-Token', csrfA1.body.data.csrfToken as string)
      .expect(201);
    const resumeId = createRes.body.data.resumeId as string;

    const csrfA3 = await agentA.get('/auth/csrf').expect(200);
    const postJob = await agentA
      .post('/chat-assist-jobs')
      .set('X-CSRF-Token', csrfA3.body.data.csrfToken as string)
      .send({
        resumeId,
        assistKind: 'experience',
      })
      .expect(201);
    const jobId = postJob.body.data.jobId as string;

    const agentB = supertest.agent(app.getHttpServer());
    await registerAndLogin(agentB, `ca-other-${Date.now()}@example.com`);

    const forbidden = await agentB
      .get(`/chat-assist-jobs/${jobId}`)
      .expect(403);
    expect(forbidden.body.error.code).toBe('CHAT_ASSIST_JOB_FORBIDDEN');
    expect(forbidden.body.requestId).toBeTruthy();
  });

  it('GET failed 终态返回 errorCode、errorMessage 与 requestId（SQL 模拟）', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `ca-fail-${Date.now()}@example.com`);

    const csrf1 = await agent.get('/auth/csrf').expect(200);
    const createRes = await agent
      .post('/resumes')
      .set('X-CSRF-Token', csrf1.body.data.csrfToken as string)
      .expect(201);
    const resumeId = createRes.body.data.resumeId as string;

    const csrf3 = await agent.get('/auth/csrf').expect(200);
    const postJob = await agent
      .post('/chat-assist-jobs')
      .set('X-CSRF-Token', csrf3.body.data.csrfToken as string)
      .send({
        resumeId,
        assistKind: 'basics',
      })
      .expect(201);
    const jobId = postJob.body.data.jobId as string;

    const msgTimedOut =
      '对话辅助超时，请稍后重试。若问题持续，请联系支持并附上 requestId。';
    const pool = app.get<PgLikePool>(APP_DB);
    await pool.query(
      `UPDATE chat_assist_jobs
          SET status = 'failed',
              error_code = $2,
              error_message = $3,
              updated_at = now()
        WHERE id = $1`,
      [
        jobId,
        CHAT_ASSIST_JOB_ERROR_CODES.CHAT_ASSIST_JOB_TIMED_OUT,
        msgTimedOut,
      ],
    );

    const res = await agent.get(`/chat-assist-jobs/${jobId}`).expect(200);
    expect(res.body.data.status).toBe('failed');
    expect(res.body.data.errorCode).toBe(
      CHAT_ASSIST_JOB_ERROR_CODES.CHAT_ASSIST_JOB_TIMED_OUT,
    );
    expect(res.body.data.errorMessage).toBe(msgTimedOut);
    expect(res.body.requestId).toBeTruthy();
  });
});
