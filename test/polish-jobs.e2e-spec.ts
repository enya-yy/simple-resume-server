import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { POLISH_JOB_ERROR_CODES } from '../src/contracts/index';
import { randomUUID } from 'node:crypto';
import type { PgLikePool } from '@simple-resume/sqlite-pg';
import supertest from 'supertest';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/bootstrap-app';
import { APP_DB } from '../src/database/app-db.token';

describe('Polish jobs (e2e)', () => {
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

  it('POST /polish-jobs 返回 jobId 与 requestId；GET 可见 queued', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `polish-a-${Date.now()}@example.com`);

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
              items: [
                {
                  id: 'i-1',
                  title: '工程师',
                  bullets: ['做了 A', '做了 B'],
                },
              ],
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

    expect(postJob.body.requestId).toBeTruthy();
    expect(postJob.body.data.jobId).toBeTruthy();
    const jobId = postJob.body.data.jobId as string;

    const poll = await agent.get(`/polish-jobs/${jobId}`).expect(200);
    expect(['queued', 'running', 'succeeded', 'failed']).toContain(
      poll.body.data.status,
    );
    expect(poll.body.requestId).toBeTruthy();
  });

  it('GET 不存在的 jobId 返回 POLISH_JOB_NOT_FOUND', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `polish-nf-${Date.now()}@example.com`);

    const fakeId = randomUUID();
    const res = await agent.get(`/polish-jobs/${fakeId}`).expect(404);
    expect(res.body.error.code).toBe('POLISH_JOB_NOT_FOUND');
    expect(res.body.requestId).toBeTruthy();
  });

  it('他人 jobId 的 GET 返回 403', async () => {
    const agentA = supertest.agent(app.getHttpServer());
    await registerAndLogin(agentA, `polish-owner-${Date.now()}@example.com`);

    const csrfA1 = await agentA.get('/auth/csrf').expect(200);
    const createRes = await agentA
      .post('/resumes')
      .set('X-CSRF-Token', csrfA1.body.data.csrfToken as string)
      .expect(201);
    const resumeId = createRes.body.data.resumeId as string;

    const csrfA2 = await agentA.get('/auth/csrf').expect(200);
    await agentA
      .patch(`/resumes/${resumeId}`)
      .set('X-CSRF-Token', csrfA2.body.data.csrfToken as string)
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
              items: [{ id: 'i-1', title: '工程师', bullets: ['x'] }],
            },
          ],
        },
      })
      .expect(200);

    const csrfA3 = await agentA.get('/auth/csrf').expect(200);
    const postJob = await agentA
      .post('/polish-jobs')
      .set('X-CSRF-Token', csrfA3.body.data.csrfToken as string)
      .send({
        resumeId,
        target: { moduleId: 'm-1', itemId: 'i-1' },
      })
      .expect(201);
    const jobId = postJob.body.data.jobId as string;

    const agentB = supertest.agent(app.getHttpServer());
    await registerAndLogin(agentB, `polish-other-${Date.now()}@example.com`);

    const forbidden = await agentB.get(`/polish-jobs/${jobId}`).expect(403);
    expect(forbidden.body.error.code).toBe('AUTH_FORBIDDEN');
    expect(forbidden.body.requestId).toBeTruthy();
  });

  it('POST 目标在文档中不存在时返回 POLISH_REQUEST_INVALID_TARGET', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `polish-bad-${Date.now()}@example.com`);

    const csrf1 = await agent.get('/auth/csrf').expect(200);
    const createRes = await agent
      .post('/resumes')
      .set('X-CSRF-Token', csrf1.body.data.csrfToken as string)
      .expect(201);
    const resumeId = createRes.body.data.resumeId as string;

    const csrf2 = await agent.get('/auth/csrf').expect(200);
    const bad = await agent
      .post('/polish-jobs')
      .set('X-CSRF-Token', csrf2.body.data.csrfToken as string)
      .send({
        resumeId,
        target: { moduleId: 'm-1', itemId: 'i-1' },
      })
      .expect(400);

    expect(bad.body.error.code).toBe('POLISH_REQUEST_INVALID_TARGET');
    expect(bad.body.requestId).toBeTruthy();
  });

  it('GET failed 终态返回 errorCode、errorMessage 与 requestId（SQL 模拟）', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `polish-fail-${Date.now()}@example.com`);

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

    const msgTimedOut =
      '润色超时，请稍后重试。若问题持续，请联系支持并附上 requestId。';
    const pool = app.get<PgLikePool>(APP_DB);
    await pool.query(
      `UPDATE polish_jobs
          SET status = 'failed',
              error_code = $2,
              error_message = $3,
              updated_at = now()
        WHERE id = $1`,
      [jobId, POLISH_JOB_ERROR_CODES.POLISH_JOB_TIMED_OUT, msgTimedOut],
    );

    const res = await agent.get(`/polish-jobs/${jobId}`).expect(200);
    expect(res.body.data.status).toBe('failed');
    expect(res.body.data.errorCode).toBe(
      POLISH_JOB_ERROR_CODES.POLISH_JOB_TIMED_OUT,
    );
    expect(res.body.data.errorMessage).toBe(msgTimedOut);
    expect(res.body.requestId).toBeTruthy();
  });
});
