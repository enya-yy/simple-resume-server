import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import supertest from 'supertest';
import {
  ERROR_CODES,
  SENSITIVE_HIDDEN_PLACEHOLDER,
} from '../src/contracts/index';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/bootstrap-app';

describe('Shares (e2e)', () => {
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

  function minimalShareableSections() {
    return [
      {
        id: 'exp-mod',
        type: 'experience' as const,
        title: '工作经历',
        order: 0,
        items: [
          {
            id: 'exp-item-1',
            title: '测试公司 · 工程师 2020—2023',
            bullets: ['职责描述'],
          },
        ],
      },
      {
        id: 'proj-mod',
        type: 'project' as const,
        title: '项目',
        order: 1,
        items: [{ id: 'proj-1', title: '示例项目', bullets: [] }],
      },
    ];
  }

  async function createResumeWithDocument(
    agent: ReturnType<typeof supertest.agent>,
    overrides?: {
      basicsSensitive?: Record<string, boolean>;
      fullName?: string;
      email?: string;
      /** 传空数组可模拟「不可分享」文档 */
      sections?: unknown[];
    },
  ) {
    const csrf1 = await agent.get('/auth/csrf').expect(200);
    const created = await agent
      .post('/resumes')
      .set('X-CSRF-Token', csrf1.body.data.csrfToken as string)
      .expect(201);
    const resumeId = created.body.data.resumeId as string;

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
            fullName: overrides?.fullName ?? 'Test User',
            email: overrides?.email ?? 'test@example.com',
            phone: '',
            location: '',
            headline: '',
            summary: '',
          },
          basicsSensitive: overrides?.basicsSensitive ?? {},
          sections: overrides?.sections ?? minimalShareableSections(),
        },
      })
      .expect(200);

    return resumeId;
  }

  async function createShareLink(
    agent: ReturnType<typeof supertest.agent>,
    resumeId: string,
    options?: { password?: string; expiresAt?: string },
  ) {
    const csrf = await agent.get('/auth/csrf').expect(200);
    const body: Record<string, string> = { resumeId };
    if (options?.password) body.password = options.password;
    if (options?.expiresAt) body.expiresAt = options.expiresAt;
    const shareRes = await agent
      .post('/shares')
      .set('X-CSRF-Token', csrf.body.data.csrfToken as string)
      .send(body)
      .expect(201);
    const shareUrl = new URL(String(shareRes.body.data.shareUrl));
    const token = shareUrl.pathname.split('/').filter(Boolean).at(-1) as string;
    return { shareRes, token };
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

  it('POST /shares 创建成功，GET /shares/:token 返回只读且敏感字段已掩码', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `share-ok-${Date.now()}@example.com`);
    const resumeId = await createResumeWithDocument(agent, {
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      basicsSensitive: { email: true, fullName: true },
    });
    const { shareRes, token } = await createShareLink(agent, resumeId);

    expect(shareRes.body.requestId).toBeTruthy();
    expect(shareRes.body.data.shareId).toBeTruthy();
    expect(shareRes.body.data.shareUrl).toMatch(/\/share\//);
    expect(shareRes.body.data.shareUrl).toMatch(
      /^http:\/\/localhost:5173\/share\//,
    );
    expect(shareRes.body.data.passwordEnabled).toBe(false);
    expect(shareRes.body.data.expirationEnabled).toBe(false);
    expect(shareRes.body.data.expiresAt).toBeNull();

    const readonly = await supertest(app.getHttpServer())
      .get(`/shares/${token}`)
      .expect(200);

    expect(readonly.body.requestId).toBeTruthy();
    expect(readonly.body.data.document.basics.fullName).toBe(
      SENSITIVE_HIDDEN_PLACEHOLDER,
    );
    expect(readonly.body.data.document.basics.email).toBe(
      SENSITIVE_HIDDEN_PLACEHOLDER,
    );

    const data = readonly.body.data;
    expect(data).toHaveProperty('document');
    expect(data).toHaveProperty('templateId');
    expect(data).toHaveProperty('layoutOptions');
    expect(data).not.toHaveProperty('resumeId');
    expect(data).not.toHaveProperty('userId');
    expect(data).not.toHaveProperty('shareId');
    expect(data).not.toHaveProperty('tokenHash');
  });

  it('POST /shares 文档未达可分享标准时返回 422 + SHARE_NOT_READY + missingItems', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `share-not-ready-${Date.now()}@example.com`);
    const resumeId = await createResumeWithDocument(agent, {
      fullName: 'Incomplete',
      email: 'inc@example.com',
      sections: [],
    });

    const csrf = await agent.get('/auth/csrf').expect(200);
    const shareRes = await agent
      .post('/shares')
      .set('X-CSRF-Token', csrf.body.data.csrfToken as string)
      .send({ resumeId })
      .expect(422);

    expect(shareRes.body.requestId).toBeTruthy();
    expect(shareRes.body.error.code).toBe(ERROR_CODES.SHARE_NOT_READY);
    expect(Array.isArray(shareRes.body.error.details?.missingItems)).toBe(true);
    expect(shareRes.body.error.details.missingItems.length).toBeGreaterThan(0);
  });

  it('GET /shares/:token 公开访问无需登录 session', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `share-public-${Date.now()}@example.com`);
    const resumeId = await createResumeWithDocument(agent, {
      fullName: 'Public Test',
      email: 'public@example.com',
    });
    const { token } = await createShareLink(agent, resumeId);

    const unauthenticatedClient = supertest(app.getHttpServer());
    const readonly = await unauthenticatedClient
      .get(`/shares/${token}`)
      .expect(200);

    expect(readonly.body.requestId).toBeTruthy();
    expect(readonly.body.data.document).toBeTruthy();
  });

  it('GET /shares/:token 无效时返回 SHARE_TOKEN_INVALID 与 requestId', async () => {
    await supertest(app.getHttpServer())
      .get('/shares/invalid-token')
      .expect(404)
      .expect((res) => {
        expect(res.body.error.code).toBe('SHARE_TOKEN_INVALID');
        expect(res.body.error.message).toBeTruthy();
        expect(res.body.requestId).toBeTruthy();
      });
  });

  // --- 5.4 Password Protection Tests ---

  it('POST /shares 带密码创建，返回 passwordEnabled=true', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `share-pwd-create-${Date.now()}@example.com`);
    const resumeId = await createResumeWithDocument(agent);
    const { shareRes } = await createShareLink(agent, resumeId, {
      password: 'secret1234',
    });

    expect(shareRes.body.data.passwordEnabled).toBe(true);
    expect(shareRes.body.data.shareUrl).toMatch(/\/share\//);
  });

  it('GET /shares/:token/meta 无密码分享返回 passwordRequired=false', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `share-meta-nopwd-${Date.now()}@example.com`);
    const resumeId = await createResumeWithDocument(agent);
    const { token } = await createShareLink(agent, resumeId);

    const metaRes = await supertest(app.getHttpServer())
      .get(`/shares/${token}/meta`)
      .expect(200);

    expect(metaRes.body.data.passwordRequired).toBe(false);
  });

  it('GET /shares/:token/meta 有密码分享返回 passwordRequired=true', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `share-meta-pwd-${Date.now()}@example.com`);
    const resumeId = await createResumeWithDocument(agent);
    const { token } = await createShareLink(agent, resumeId, {
      password: 'mypass99',
    });

    const metaRes = await supertest(app.getHttpServer())
      .get(`/shares/${token}/meta`)
      .expect(200);

    expect(metaRes.body.data.passwordRequired).toBe(true);
  });

  it('POST verify-password 正确密码返回 verified=true', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `share-verify-ok-${Date.now()}@example.com`);
    const resumeId = await createResumeWithDocument(agent);
    const { token } = await createShareLink(agent, resumeId, {
      password: 'correct123',
    });

    const verifyRes = await agent
      .post(`/shares/${token}/verify-password`)
      .send({ password: 'correct123' })
      .expect(201);

    expect(verifyRes.body.data.verified).toBe(true);
    expect(verifyRes.body.requestId).toBeTruthy();
  });

  it('POST verify-password 错误密码返回 SHARE_PASSWORD_INVALID', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `share-verify-bad-${Date.now()}@example.com`);
    const resumeId = await createResumeWithDocument(agent);
    const { token } = await createShareLink(agent, resumeId, {
      password: 'correct123',
    });

    const verifyRes = await supertest(app.getHttpServer())
      .post(`/shares/${token}/verify-password`)
      .send({ password: 'wrong-password' })
      .expect(401);

    expect(verifyRes.body.error.code).toBe('SHARE_PASSWORD_INVALID');
    expect(verifyRes.body.requestId).toBeTruthy();
  });

  it('POST verify-password 无效 token 返回 SHARE_TOKEN_INVALID', async () => {
    const verifyRes = await supertest(app.getHttpServer())
      .post('/shares/nonexistent-token/verify-password')
      .send({ password: 'anything' })
      .expect(404);

    expect(verifyRes.body.error.code).toBe('SHARE_TOKEN_INVALID');
    expect(verifyRes.body.requestId).toBeTruthy();
  });

  it('POST verify-password 对无密码分享直接返回 verified=true', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(
      agent,
      `share-verify-nopwd-${Date.now()}@example.com`,
    );
    const resumeId = await createResumeWithDocument(agent);
    const { token } = await createShareLink(agent, resumeId);

    const verifyRes = await supertest(app.getHttpServer())
      .post(`/shares/${token}/verify-password`)
      .send({ password: 'anything' })
      .expect(201);

    expect(verifyRes.body.data.verified).toBe(true);
  });

  it('带密码分享在校验前禁止读取正文，校验后才可读取', async () => {
    const owner = supertest.agent(app.getHttpServer());
    await registerAndLogin(owner, `share-guard-${Date.now()}@example.com`);
    const resumeId = await createResumeWithDocument(owner);
    const { token } = await createShareLink(owner, resumeId, {
      password: 'correct123',
    });

    await supertest(app.getHttpServer())
      .get(`/shares/${token}`)
      .expect(401)
      .expect((res) => {
        expect(res.body.error.code).toBe('SHARE_PASSWORD_REQUIRED');
        expect(res.body.requestId).toBeTruthy();
      });

    const collaborator = supertest.agent(app.getHttpServer());
    await collaborator
      .post(`/shares/${token}/verify-password`)
      .send({ password: 'correct123' })
      .expect(201);

    const readonly = await collaborator.get(`/shares/${token}`).expect(200);
    expect(readonly.body.data.document).toBeTruthy();
  });

  it('POST verify-password 连续错误触发限流并返回 THROTTLE_LIMIT + requestId', async () => {
    const owner = supertest.agent(app.getHttpServer());
    await registerAndLogin(owner, `share-throttle-${Date.now()}@example.com`);
    const resumeId = await createResumeWithDocument(owner);
    const { token } = await createShareLink(owner, resumeId, {
      password: 'correct123',
    });

    const attacker = supertest.agent(app.getHttpServer());
    for (let i = 0; i < 5; i += 1) {
      await attacker
        .post(`/shares/${token}/verify-password`)
        .send({ password: 'wrong-password' })
        .expect(401);
    }

    await attacker
      .post(`/shares/${token}/verify-password`)
      .send({ password: 'wrong-password' })
      .expect(429)
      .expect((res) => {
        expect(res.body.error.code).toBe('THROTTLE_LIMIT');
        expect(res.body.requestId).toBeTruthy();
      });
  });

  it('不带密码的旧分享仍可按 5.2/5.3 正常只读访问（回归）', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `share-compat-${Date.now()}@example.com`);
    const resumeId = await createResumeWithDocument(agent, {
      fullName: 'Compat Test',
      email: 'compat@example.com',
    });
    const { token } = await createShareLink(agent, resumeId);

    const metaRes = await supertest(app.getHttpServer())
      .get(`/shares/${token}/meta`)
      .expect(200);
    expect(metaRes.body.data.passwordRequired).toBe(false);

    const readonly = await supertest(app.getHttpServer())
      .get(`/shares/${token}`)
      .expect(200);
    expect(readonly.body.data.document).toBeTruthy();
    expect(readonly.body.data.document.basics.fullName).toBe('Compat Test');
  });

  it('GET /shares/:token/meta 无效 token 返回 SHARE_TOKEN_INVALID', async () => {
    await supertest(app.getHttpServer())
      .get('/shares/invalid-token/meta')
      .expect(404)
      .expect((res) => {
        expect(res.body.error.code).toBe('SHARE_TOKEN_INVALID');
        expect(res.body.requestId).toBeTruthy();
      });
  });

  // --- 5.5 Expiration Control Tests ---

  it('POST /shares 创建带有效期的分享，返回 expirationEnabled=true 与 expiresAt', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(
      agent,
      `share-expire-create-${Date.now()}@example.com`,
    );
    const resumeId = await createResumeWithDocument(agent);
    const futureDate = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { shareRes } = await createShareLink(agent, resumeId, {
      expiresAt: futureDate,
    });

    expect(shareRes.body.data.expirationEnabled).toBe(true);
    expect(shareRes.body.data.expiresAt).toBeTruthy();
    expect(shareRes.body.data.shareUrl).toMatch(/\/share\//);
  });

  it('POST /shares 拒绝过去时间的 expiresAt', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(
      agent,
      `share-expire-past-${Date.now()}@example.com`,
    );
    const resumeId = await createResumeWithDocument(agent);
    const pastDate = new Date(Date.now() - 60 * 1000).toISOString();

    const csrf = await agent.get('/auth/csrf').expect(200);
    const res = await agent
      .post('/shares')
      .set('X-CSRF-Token', csrf.body.data.csrfToken as string)
      .send({ resumeId, expiresAt: pastDate })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.requestId).toBeTruthy();
  });

  it('POST /shares 拒绝超过一年的 expiresAt', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `share-expire-far-${Date.now()}@example.com`);
    const resumeId = await createResumeWithDocument(agent);
    const farFuture = new Date(
      Date.now() + 400 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const csrf = await agent.get('/auth/csrf').expect(200);
    const res = await agent
      .post('/shares')
      .set('X-CSRF-Token', csrf.body.data.csrfToken as string)
      .send({ resumeId, expiresAt: farFuture })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.requestId).toBeTruthy();
  });

  it('未过期的分享可正常访问 meta 和正文', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `share-expire-ok-${Date.now()}@example.com`);
    const resumeId = await createResumeWithDocument(agent);
    const futureDate = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { token } = await createShareLink(agent, resumeId, {
      expiresAt: futureDate,
    });

    const metaRes = await supertest(app.getHttpServer())
      .get(`/shares/${token}/meta`)
      .expect(200);
    expect(metaRes.body.data.expiresAt).toBeTruthy();
    expect(metaRes.body.data.passwordRequired).toBe(false);

    const readonly = await supertest(app.getHttpServer())
      .get(`/shares/${token}`)
      .expect(200);
    expect(readonly.body.data.document).toBeTruthy();
  });

  it('过期后 meta 接口返回 SHARE_EXPIRED 且不含正文', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(
      agent,
      `share-expire-meta-${Date.now()}@example.com`,
    );
    const resumeId = await createResumeWithDocument(agent);

    const csrf = await agent.get('/auth/csrf').expect(200);
    const expiresAt = new Date(Date.now() + 6 * 60 * 1000).toISOString();
    const shareRes = await agent
      .post('/shares')
      .set('X-CSRF-Token', csrf.body.data.csrfToken as string)
      .send({ resumeId, expiresAt })
      .expect(201);
    const shareUrl = new URL(String(shareRes.body.data.shareUrl));
    const token = shareUrl.pathname.split('/').filter(Boolean).at(-1) as string;
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const { PgLikePool } = await import('@simple-resume/sqlite-pg');
    const pool = PgLikePool.open(process.env.SQLITE_DATABASE_PATH!);
    const past = new Date(Date.now() - 60_000).toISOString();
    await pool.query(
      `UPDATE shares SET expires_at = $1 WHERE token_hash = $2`,
      [past, tokenHash],
    );
    await pool.close();

    const metaRes = await supertest(app.getHttpServer())
      .get(`/shares/${token}/meta`)
      .expect(410);

    expect(metaRes.body.error.code).toBe('SHARE_EXPIRED');
    expect(metaRes.body.requestId).toBeTruthy();
    expect(metaRes.body.data).toBeUndefined();
  });

  it('过期后 GET /shares/:token 返回 SHARE_EXPIRED 且不含正文', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `share-expire-get-${Date.now()}@example.com`);
    const resumeId = await createResumeWithDocument(agent);

    const csrf = await agent.get('/auth/csrf').expect(200);
    const expiresAt = new Date(Date.now() + 6 * 60 * 1000).toISOString();
    const shareRes = await agent
      .post('/shares')
      .set('X-CSRF-Token', csrf.body.data.csrfToken as string)
      .send({ resumeId, expiresAt })
      .expect(201);
    const shareUrl = new URL(String(shareRes.body.data.shareUrl));
    const token = shareUrl.pathname.split('/').filter(Boolean).at(-1) as string;
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const { PgLikePool } = await import('@simple-resume/sqlite-pg');
    const pool = PgLikePool.open(process.env.SQLITE_DATABASE_PATH!);
    const past = new Date(Date.now() - 60_000).toISOString();
    await pool.query(
      `UPDATE shares SET expires_at = $1 WHERE token_hash = $2`,
      [past, tokenHash],
    );
    await pool.close();

    const res = await supertest(app.getHttpServer())
      .get(`/shares/${token}`)
      .expect(410);

    expect(res.body.error.code).toBe('SHARE_EXPIRED');
    expect(res.body.requestId).toBeTruthy();
    expect(res.body.data).toBeUndefined();
  });

  it('过期后 verify-password 返回 SHARE_EXPIRED', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `share-expire-pwd-${Date.now()}@example.com`);
    const resumeId = await createResumeWithDocument(agent);

    const csrf = await agent.get('/auth/csrf').expect(200);
    const expiresAt = new Date(Date.now() + 6 * 60 * 1000).toISOString();
    const shareRes = await agent
      .post('/shares')
      .set('X-CSRF-Token', csrf.body.data.csrfToken as string)
      .send({ resumeId, expiresAt, password: 'pass1234' })
      .expect(201);
    const shareUrl = new URL(String(shareRes.body.data.shareUrl));
    const token = shareUrl.pathname.split('/').filter(Boolean).at(-1) as string;
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const { PgLikePool } = await import('@simple-resume/sqlite-pg');
    const pool = PgLikePool.open(process.env.SQLITE_DATABASE_PATH!);
    const past = new Date(Date.now() - 60_000).toISOString();
    await pool.query(
      `UPDATE shares SET expires_at = $1 WHERE token_hash = $2`,
      [past, tokenHash],
    );
    await pool.close();

    const res = await supertest(app.getHttpServer())
      .post(`/shares/${token}/verify-password`)
      .send({ password: 'pass1234' })
      .expect(410);

    expect(res.body.error.code).toBe('SHARE_EXPIRED');
    expect(res.body.requestId).toBeTruthy();
  });

  it('无有效期的旧分享仍可正常只读访问（回归）', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `share-no-expire-${Date.now()}@example.com`);
    const resumeId = await createResumeWithDocument(agent, {
      fullName: 'NoExpire Test',
      email: 'noexpire@example.com',
    });
    const { token } = await createShareLink(agent, resumeId);

    const metaRes = await supertest(app.getHttpServer())
      .get(`/shares/${token}/meta`)
      .expect(200);
    expect(metaRes.body.data.passwordRequired).toBe(false);
    expect(metaRes.body.data.expiresAt).toBeNull();

    const readonly = await supertest(app.getHttpServer())
      .get(`/shares/${token}`)
      .expect(200);
    expect(readonly.body.data.document).toBeTruthy();
    expect(readonly.body.data.document.basics.fullName).toBe('NoExpire Test');
  });

  it('同时带密码和有效期时，过期优先于密码校验', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(
      agent,
      `share-expire-pwd-combo-${Date.now()}@example.com`,
    );
    const resumeId = await createResumeWithDocument(agent);

    const csrf = await agent.get('/auth/csrf').expect(200);
    const expiresAt = new Date(Date.now() + 6 * 60 * 1000).toISOString();
    const shareRes = await agent
      .post('/shares')
      .set('X-CSRF-Token', csrf.body.data.csrfToken as string)
      .send({ resumeId, expiresAt, password: 'combo123' })
      .expect(201);
    const shareUrl = new URL(String(shareRes.body.data.shareUrl));
    const token = shareUrl.pathname.split('/').filter(Boolean).at(-1) as string;

    expect(shareRes.body.data.passwordEnabled).toBe(true);
    expect(shareRes.body.data.expirationEnabled).toBe(true);

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const { PgLikePool } = await import('@simple-resume/sqlite-pg');
    const pool = PgLikePool.open(process.env.SQLITE_DATABASE_PATH!);
    const past = new Date(Date.now() - 60_000).toISOString();
    await pool.query(
      `UPDATE shares SET expires_at = $1 WHERE token_hash = $2`,
      [past, tokenHash],
    );
    await pool.close();

    // Verify-password should return SHARE_EXPIRED, not SHARE_PASSWORD_REQUIRED
    const res = await supertest(app.getHttpServer())
      .post(`/shares/${token}/verify-password`)
      .send({ password: 'combo123' })
      .expect(410);

    expect(res.body.error.code).toBe('SHARE_EXPIRED');
  });
});
