import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/bootstrap-app';

describe('Auth (e2e)', () => {
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

  it('register → me → logout → me 401，且含 requestId', async () => {
    const agent = supertest.agent(app.getHttpServer());
    const email = `e2e-${Date.now()}@example.com`;
    const password = 'password12';

    const csrfRes = await agent.get('/auth/csrf').expect(200);
    expect(csrfRes.body.requestId).toBeTruthy();
    const csrfToken = csrfRes.body.data.csrfToken as string;

    const reg = await agent
      .post('/auth/register')
      .set('X-CSRF-Token', csrfToken)
      .send({ email, password })
      .expect(201);
    expect(reg.body.requestId).toBeTruthy();

    const me1 = await agent.get('/auth/me').expect(200);
    expect(me1.body.data.email).toBe(email.toLowerCase());
    expect(me1.body.requestId).toBeTruthy();

    const csrf2 = await agent.get('/auth/csrf').expect(200);
    const logout = await agent
      .post('/auth/logout')
      .set('X-CSRF-Token', csrf2.body.data.csrfToken as string)
      .expect(201);
    expect(logout.body.requestId).toBeTruthy();

    const me401 = await agent.get('/auth/me').expect(401);
    expect(me401.body.error.code).toBe('AUTH_REQUIRED');
    expect(me401.body.requestId).toBeTruthy();
  });

  it('无 CSRF 的 POST /auth/register 返回 CSRF 错误', async () => {
    await supertest(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'x@y.z', password: 'password12' })
      .expect(403)
      .expect((res) => {
        expect(res.body.error.code).toBe('CSRF_INVALID');
        expect(res.body.requestId).toBeTruthy();
      });
  });

  it('登录限流触发后返回 THROTTLE_LIMIT 与 requestId', async () => {
    const agent = supertest.agent(app.getHttpServer());
    const csrfRes = await agent.get('/auth/csrf').expect(200);
    const csrfToken = csrfRes.body.data.csrfToken as string;

    for (let i = 0; i < 5; i++) {
      await agent
        .post('/auth/login')
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'missing@example.com', password: 'password12' })
        .expect(401);
    }

    await agent
      .post('/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ email: 'missing@example.com', password: 'password12' })
      .expect(429)
      .expect((res) => {
        expect(res.body.error.code).toBe('THROTTLE_LIMIT');
        expect(res.body.requestId).toBeTruthy();
      });
  });

  it('创建简历时带默认 document，且可按 resumeId 读取', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `resume-owner-${Date.now()}@example.com`);

    const csrf = await agent.get('/auth/csrf').expect(200);
    const createRes = await agent
      .post('/resumes')
      .set('X-CSRF-Token', csrf.body.data.csrfToken as string)
      .expect(201);

    expect(createRes.body.requestId).toBeTruthy();
    expect(createRes.body.data.resumeId).toBeTruthy();
    expect(createRes.body.data.sessionId).toBeTruthy();
    expect(createRes.body.data.document.sections).toEqual([]);

    const resumeId = createRes.body.data.resumeId as string;
    const loadRes = await agent.get(`/resumes/${resumeId}`).expect(200);

    expect(loadRes.body.requestId).toBeTruthy();
    expect(loadRes.body.data.resumeId).toBe(resumeId);
    expect(loadRes.body.data.document.basics.fullName).toBe('');
    expect(loadRes.body.data.document.basics.phone).toBe('');
    expect(loadRes.body.data.document.basics.location).toBe('');
    expect(loadRes.body.data.document.basics.headline).toBe('');
    expect(loadRes.body.data.document.templateId).toBe('classic-list');
    expect(loadRes.body.data.document.layoutOptions).toEqual({
      fontSizeStep: 1,
      pageMargin: 'standard',
      bodyLineHeight: 'normal',
      showAvatar: true,
    });
    expect(loadRes.body.data.schemaVersion).toBe(1);
  });

  it('GET /resumes 返回当前用户简历列表，按最近更新时间倒序', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `resume-list-${Date.now()}@example.com`);

    const csrf1 = await agent.get('/auth/csrf').expect(200);
    const firstCreate = await agent
      .post('/resumes')
      .set('X-CSRF-Token', csrf1.body.data.csrfToken as string)
      .expect(201);

    const csrf2 = await agent.get('/auth/csrf').expect(200);
    const secondCreate = await agent
      .post('/resumes')
      .set('X-CSRF-Token', csrf2.body.data.csrfToken as string)
      .expect(201);

    const listRes = await agent.get('/resumes').expect(200);
    expect(listRes.body.requestId).toBeTruthy();
    expect(listRes.body.data.resumes).toHaveLength(2);
    expect(listRes.body.data.resumes[0]).toMatchObject({
      resumeId: secondCreate.body.data.resumeId,
      title: '未命名简历',
    });
    expect(listRes.body.data.resumes[1]).toMatchObject({
      resumeId: firstCreate.body.data.resumeId,
      title: '未命名简历',
    });
    expect(Date.parse(listRes.body.data.resumes[0].updatedAt)).not.toBeNaN();
  });

  it('GET /resumes 未登录时返回 401', async () => {
    await supertest(app.getHttpServer())
      .get('/resumes')
      .expect(401)
      .expect((res) => {
        expect(res.body.error.code).toBe('AUTH_REQUIRED');
        expect(res.body.requestId).toBeTruthy();
      });
  });

  it('DELETE /resumes/:resumeId 删除简历，后续按 resumeId 读取为 404', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `resume-delete-${Date.now()}@example.com`);

    const csrf1 = await agent.get('/auth/csrf').expect(200);
    const createRes = await agent
      .post('/resumes')
      .set('X-CSRF-Token', csrf1.body.data.csrfToken as string)
      .expect(201);
    const resumeId = createRes.body.data.resumeId as string;

    const csrf2 = await agent.get('/auth/csrf').expect(200);
    await agent
      .delete(`/resumes/${resumeId}`)
      .set('X-CSRF-Token', csrf2.body.data.csrfToken as string)
      .expect(200)
      .expect((res) => {
        expect(res.body.requestId).toBeTruthy();
      });

    await agent.get(`/resumes/${resumeId}`).expect(404);
  });

  it('登录用户可 PATCH 简历，返回标准响应并可刷新读取', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `patch-owner-${Date.now()}@example.com`);
    const csrf = await agent.get('/auth/csrf').expect(200);
    const createRes = await agent
      .post('/resumes')
      .set('X-CSRF-Token', csrf.body.data.csrfToken as string)
      .expect(201);
    const resumeId = createRes.body.data.resumeId as string;

    const csrf2 = await agent.get('/auth/csrf').expect(200);
    const patchRes = await agent
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
            fullName: 'Ada Lovelace',
            email: 'ada@example.com',
            phone: '+86 138 0000 0000',
            location: 'London',
            headline: 'Engineer',
            summary: 'First programmer',
          },
          sections: [],
        },
      })
      .expect(200);

    expect(patchRes.body.requestId).toBeTruthy();
    expect(patchRes.body.data.resumeId).toBe(resumeId);
    expect(patchRes.body.data.document.basics.fullName).toBe('Ada Lovelace');
    expect(patchRes.body.data.document.sections).toEqual([]);

    const loadRes = await agent.get(`/resumes/${resumeId}`).expect(200);
    expect(loadRes.body.data.document.basics.fullName).toBe('Ada Lovelace');
    expect(loadRes.body.requestId).toBeTruthy();
  });

  it('PATCH 省略 layoutOptions 时保留库内已有版式选项', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(
      agent,
      `patch-layout-omit-${Date.now()}@example.com`,
    );
    const csrf = await agent.get('/auth/csrf').expect(200);
    const createRes = await agent
      .post('/resumes')
      .set('X-CSRF-Token', csrf.body.data.csrfToken as string)
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
            fontSizeStep: 2,
            pageMargin: 'compact',
            bodyLineHeight: 'relaxed',
          },
          basics: {
            fullName: 'One',
            email: 'one@example.com',
            phone: '',
            location: '',
            headline: '',
            summary: '',
          },
          sections: [],
        },
      })
      .expect(200);

    const csrf3 = await agent.get('/auth/csrf').expect(200);
    await agent
      .patch(`/resumes/${resumeId}`)
      .set('X-CSRF-Token', csrf3.body.data.csrfToken as string)
      .send({
        document: {
          templateId: 'classic-list',
          basics: {
            fullName: 'Two',
            email: 'two@example.com',
            phone: '',
            location: '',
            headline: '',
            summary: '',
          },
          sections: [],
        },
      })
      .expect(200);

    const loadRes = await agent.get(`/resumes/${resumeId}`).expect(200);
    expect(loadRes.body.data.document.basics.fullName).toBe('Two');
    expect(loadRes.body.data.document.layoutOptions).toEqual({
      fontSizeStep: 2,
      pageMargin: 'compact',
      bodyLineHeight: 'relaxed',
      showAvatar: true,
    });
  });

  it('登录用户可持久化模块重排与删除', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(
      agent,
      `patch-modules-owner-${Date.now()}@example.com`,
    );
    const csrf = await agent.get('/auth/csrf').expect(200);
    const createRes = await agent
      .post('/resumes')
      .set('X-CSRF-Token', csrf.body.data.csrfToken as string)
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
            fullName: 'Ada Lovelace',
            email: 'ada@example.com',
            phone: '',
            location: '',
            headline: '',
            summary: '',
          },
          sections: [
            { id: 'm-2', type: 'project', title: '项目', items: [], order: 10 },
            {
              id: 'm-1',
              type: 'experience',
              title: '经历',
              items: [],
              order: 99,
            },
          ],
        },
      })
      .expect(200)
      .expect((res) => {
        expect(res.body.requestId).toBeTruthy();
        expect(res.body.data.document.sections[0].id).toBe('m-2');
        expect(res.body.data.document.sections[0].order).toBe(0);
        expect(res.body.data.document.sections[1].id).toBe('m-1');
        expect(res.body.data.document.sections[1].order).toBe(1);
      });

    const csrf3 = await agent.get('/auth/csrf').expect(200);
    await agent
      .patch(`/resumes/${resumeId}`)
      .set('X-CSRF-Token', csrf3.body.data.csrfToken as string)
      .send({
        document: {
          templateId: 'classic-list',
          layoutOptions: {
            fontSizeStep: 1,
            pageMargin: 'standard',
            bodyLineHeight: 'normal',
          },
          basics: {
            fullName: 'Ada Lovelace',
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
              items: [],
              order: 0,
            },
          ],
        },
      })
      .expect(200);

    const loadRes = await agent.get(`/resumes/${resumeId}`).expect(200);
    expect(loadRes.body.requestId).toBeTruthy();
    expect(loadRes.body.data.document.sections).toHaveLength(1);
    expect(loadRes.body.data.document.sections[0].id).toBe('m-1');
  });

  it('登录用户可更新条目与要点结构，越权请求被拒绝并带 requestId', async () => {
    const ownerAgent = supertest.agent(app.getHttpServer());
    await registerAndLogin(ownerAgent, `items-owner-${Date.now()}@example.com`);
    const ownerCsrf = await ownerAgent.get('/auth/csrf').expect(200);
    const createRes = await ownerAgent
      .post('/resumes')
      .set('X-CSRF-Token', ownerCsrf.body.data.csrfToken as string)
      .expect(201);
    const resumeId = createRes.body.data.resumeId as string;

    const ownerCsrf2 = await ownerAgent.get('/auth/csrf').expect(200);
    const patchRes = await ownerAgent
      .patch(`/resumes/${resumeId}`)
      .set('X-CSRF-Token', ownerCsrf2.body.data.csrfToken as string)
      .send({
        document: {
          templateId: 'classic-list',
          layoutOptions: {
            fontSizeStep: 1,
            pageMargin: 'standard',
            bodyLineHeight: 'normal',
          },
          basics: {
            fullName: 'Ada Lovelace',
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
                  title: '前端工程师',
                  bullets: ['优化首屏性能', '重构简历编辑器'],
                },
              ],
            },
          ],
        },
      })
      .expect(200);

    expect(patchRes.body.requestId).toBeTruthy();
    expect(patchRes.body.data.document.sections[0].items[0].title).toBe(
      '前端工程师',
    );
    expect(patchRes.body.data.document.sections[0].items[0].bullets).toEqual([
      '优化首屏性能',
      '重构简历编辑器',
    ]);

    const loadRes = await ownerAgent.get(`/resumes/${resumeId}`).expect(200);
    expect(loadRes.body.requestId).toBeTruthy();
    expect(loadRes.body.data.document.sections[0].items[0].bullets[1]).toBe(
      '重构简历编辑器',
    );

    const otherAgent = supertest.agent(app.getHttpServer());
    await registerAndLogin(otherAgent, `items-other-${Date.now()}@example.com`);
    const otherCsrf = await otherAgent.get('/auth/csrf').expect(200);
    await otherAgent
      .patch(`/resumes/${resumeId}`)
      .set('X-CSRF-Token', otherCsrf.body.data.csrfToken as string)
      .send({
        document: {
          templateId: 'classic-list',
          layoutOptions: {
            fontSizeStep: 1,
            pageMargin: 'standard',
            bodyLineHeight: 'normal',
          },
          basics: {
            fullName: 'B',
            email: 'b@b.co',
            phone: '',
            location: '',
            headline: '',
            summary: '',
          },
          sections: [],
        },
      })
      .expect(404)
      .expect((res) => {
        expect(res.body.error.code).toBe('RESUME_NOT_FOUND');
        expect(res.body.requestId).toBeTruthy();
      });
  });

  it('PATCH /resumes/:id 在未登录/越权/参数错误时返回标准错误与 requestId', async () => {
    const ownerAgent = supertest.agent(app.getHttpServer());
    await registerAndLogin(
      ownerAgent,
      `patch-owner2-${Date.now()}@example.com`,
    );
    const ownerCsrf = await ownerAgent.get('/auth/csrf').expect(200);
    const createRes = await ownerAgent
      .post('/resumes')
      .set('X-CSRF-Token', ownerCsrf.body.data.csrfToken as string)
      .expect(201);
    const resumeId = createRes.body.data.resumeId as string;

    await supertest(app.getHttpServer())
      .patch(`/resumes/${resumeId}`)
      .send({
        document: {
          templateId: 'classic-list',
          layoutOptions: {
            fontSizeStep: 1,
            pageMargin: 'standard',
            bodyLineHeight: 'normal',
          },
          basics: {
            fullName: 'A',
            email: 'a@b.co',
            phone: '',
            location: '',
            headline: '',
            summary: '',
          },
          sections: [],
        },
      })
      .expect(401)
      .expect((res) => {
        expect(res.body.error.code).toBe('AUTH_REQUIRED');
        expect(res.body.requestId).toBeTruthy();
      });

    const otherAgent = supertest.agent(app.getHttpServer());
    await registerAndLogin(otherAgent, `patch-other-${Date.now()}@example.com`);
    const otherCsrf = await otherAgent.get('/auth/csrf').expect(200);
    await otherAgent
      .patch(`/resumes/${resumeId}`)
      .set('X-CSRF-Token', otherCsrf.body.data.csrfToken as string)
      .send({
        document: {
          templateId: 'classic-list',
          layoutOptions: {
            fontSizeStep: 1,
            pageMargin: 'standard',
            bodyLineHeight: 'normal',
          },
          basics: {
            fullName: 'B',
            email: 'b@b.co',
            phone: '',
            location: '',
            headline: '',
            summary: '',
          },
          sections: [],
        },
      })
      .expect(404)
      .expect((res) => {
        expect(res.body.error.code).toBe('RESUME_NOT_FOUND');
        expect(res.body.requestId).toBeTruthy();
      });

    const ownerCsrf2 = await ownerAgent.get('/auth/csrf').expect(200);
    await ownerAgent
      .patch(`/resumes/${resumeId}`)
      .set('X-CSRF-Token', ownerCsrf2.body.data.csrfToken as string)
      .send({
        document: {
          templateId: 'classic-list',
          layoutOptions: {
            fontSizeStep: 1,
            pageMargin: 'standard',
            bodyLineHeight: 'normal',
          },
          basics: {
            fullName: '',
            email: 'bad-email',
            phone: 'abc',
            location: '',
            headline: '',
            summary: '',
          },
          sections: [],
        },
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
        expect(res.body.requestId).toBeTruthy();
      });
  });

  it('PATCH /resumes/:id 缺少 CSRF 返回 403', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(
      agent,
      `patch-resume-csrf-${Date.now()}@example.com`,
    );
    const csrf1 = await agent.get('/auth/csrf').expect(200);
    const createRes = await agent
      .post('/resumes')
      .set('X-CSRF-Token', csrf1.body.data.csrfToken as string)
      .expect(201);
    const resumeId = createRes.body.data.resumeId as string;

    await agent
      .patch(`/resumes/${resumeId}`)
      .send({
        document: {
          templateId: 'classic-list',
          layoutOptions: {
            fontSizeStep: 1,
            pageMargin: 'standard',
            bodyLineHeight: 'normal',
          },
          basics: {
            fullName: '仅 PATCH',
            email: 'p@example.com',
            phone: '',
            location: '',
            headline: '',
            summary: '',
          },
          sections: [],
        },
      })
      .expect(403)
      .expect((res) => {
        expect(res.body.error.code).toBe('CSRF_INVALID');
        expect(res.body.requestId).toBeTruthy();
      });
  });

  it('未登录访问创建/读取简历会被拒绝', async () => {
    const agent = supertest.agent(app.getHttpServer());

    await agent
      .post('/resumes')
      .expect(401)
      .expect((res) => {
        expect(res.body.error.code).toBe('AUTH_REQUIRED');
        expect(res.body.requestId).toBeTruthy();
      });

    await agent
      .get('/resumes/00000000-0000-0000-0000-000000000000')
      .expect(401)
      .expect((res) => {
        expect(res.body.error.code).toBe('AUTH_REQUIRED');
        expect(res.body.requestId).toBeTruthy();
      });
  });

  it('POST /resumes/:resumeId/duplicate 复制为新简历，源 document 不变', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await registerAndLogin(agent, `dup-owner-${Date.now()}@example.com`);
    const csrf1 = await agent.get('/auth/csrf').expect(200);
    const createRes = await agent
      .post('/resumes')
      .set('X-CSRF-Token', csrf1.body.data.csrfToken as string)
      .expect(201);
    const sourceResumeId = createRes.body.data.resumeId as string;

    const csrf2 = await agent.get('/auth/csrf').expect(200);
    await agent
      .patch(`/resumes/${sourceResumeId}`)
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
            fullName: '快照姓名',
            email: 'snap@example.com',
            phone: '',
            location: '',
            headline: '',
            summary: '',
          },
          sections: [],
        },
      })
      .expect(200);

    const csrf3 = await agent.get('/auth/csrf').expect(200);
    const dupRes = await agent
      .post(`/resumes/${sourceResumeId}/duplicate`)
      .set('X-CSRF-Token', csrf3.body.data.csrfToken as string)
      .expect(201);

    expect(dupRes.body.requestId).toBeTruthy();
    const newResumeId = dupRes.body.data.resumeId as string;
    expect(newResumeId).not.toBe(sourceResumeId);
    expect(dupRes.body.data.document.basics.fullName).toBe('快照姓名');

    const loadSource = await agent
      .get(`/resumes/${sourceResumeId}`)
      .expect(200);
    expect(loadSource.body.data.document.basics.fullName).toBe('快照姓名');

    const loadNew = await agent.get(`/resumes/${newResumeId}`).expect(200);
    expect(loadNew.body.data.document.basics.fullName).toBe('快照姓名');
    expect(loadNew.body.data.resumeId).toBe(newResumeId);
  });

  it('GET /resumes/:resumeId 未登录 401，越权 404', async () => {
    const ownerAgent = supertest.agent(app.getHttpServer());
    await registerAndLogin(
      ownerAgent,
      `get-res-owner-${Date.now()}@example.com`,
    );
    const ownerCsrf = await ownerAgent.get('/auth/csrf').expect(200);
    const createRes = await ownerAgent
      .post('/resumes')
      .set('X-CSRF-Token', ownerCsrf.body.data.csrfToken as string)
      .expect(201);
    const resumeId = createRes.body.data.resumeId as string;

    await supertest(app.getHttpServer())
      .get(`/resumes/${resumeId}`)
      .expect(401)
      .expect((res) => {
        expect(res.body.error.code).toBe('AUTH_REQUIRED');
        expect(res.body.requestId).toBeTruthy();
      });

    const otherAgent = supertest.agent(app.getHttpServer());
    await registerAndLogin(
      otherAgent,
      `get-res-other-${Date.now()}@example.com`,
    );
    await otherAgent
      .get(`/resumes/${resumeId}`)
      .expect(404)
      .expect((res) => {
        expect(res.body.error.code).toBe('RESUME_NOT_FOUND');
        expect(res.body.requestId).toBeTruthy();
      });
  });

  it('POST /resumes/:resumeId/duplicate 未登录、缺 CSRF、越权时拒绝', async () => {
    const ownerAgent = supertest.agent(app.getHttpServer());
    await registerAndLogin(ownerAgent, `dup-guard-${Date.now()}@example.com`);
    const ownerCsrf = await ownerAgent.get('/auth/csrf').expect(200);
    const createRes = await ownerAgent
      .post('/resumes')
      .set('X-CSRF-Token', ownerCsrf.body.data.csrfToken as string)
      .expect(201);
    const resumeId = createRes.body.data.resumeId as string;

    await supertest(app.getHttpServer())
      .post(`/resumes/${resumeId}/duplicate`)
      .expect(401)
      .expect((res) => {
        expect(res.body.error.code).toBe('AUTH_REQUIRED');
        expect(res.body.requestId).toBeTruthy();
      });

    await ownerAgent
      .post(`/resumes/${resumeId}/duplicate`)
      .expect(403)
      .expect((res) => {
        expect(res.body.error.code).toBe('CSRF_INVALID');
        expect(res.body.requestId).toBeTruthy();
      });

    const otherAgent = supertest.agent(app.getHttpServer());
    await registerAndLogin(otherAgent, `dup-other-${Date.now()}@example.com`);
    const otherCsrf = await otherAgent.get('/auth/csrf').expect(200);
    await otherAgent
      .post(`/resumes/${resumeId}/duplicate`)
      .set('X-CSRF-Token', otherCsrf.body.data.csrfToken as string)
      .expect(404)
      .expect((res) => {
        expect(res.body.error.code).toBe('RESUME_NOT_FOUND');
        expect(res.body.requestId).toBeTruthy();
      });
  });

  it('登录用户读取他人简历返回 404', async () => {
    const ownerAgent = supertest.agent(app.getHttpServer());
    await registerAndLogin(ownerAgent, `owner-${Date.now()}@example.com`);
    const ownerCsrf = await ownerAgent.get('/auth/csrf').expect(200);
    const createRes = await ownerAgent
      .post('/resumes')
      .set('X-CSRF-Token', ownerCsrf.body.data.csrfToken as string)
      .expect(201);
    const resumeId = createRes.body.data.resumeId as string;

    const otherAgent = supertest.agent(app.getHttpServer());
    await registerAndLogin(otherAgent, `other-${Date.now()}@example.com`);

    await otherAgent
      .get(`/resumes/${resumeId}`)
      .expect(404)
      .expect((res) => {
        expect(res.body.error.code).toBe('RESUME_NOT_FOUND');
        expect(res.body.requestId).toBeTruthy();
      });
  });

  it('DELETE /resumes/:resumeId 越权 404，不存在 404，缺 CSRF 403', async () => {
    const ownerAgent = supertest.agent(app.getHttpServer());
    await registerAndLogin(
      ownerAgent,
      `del-acl-owner-${Date.now()}@example.com`,
    );
    const ownerCsrf = await ownerAgent.get('/auth/csrf').expect(200);
    const createRes = await ownerAgent
      .post('/resumes')
      .set('X-CSRF-Token', ownerCsrf.body.data.csrfToken as string)
      .expect(201);
    const resumeId = createRes.body.data.resumeId as string;

    const otherAgent = supertest.agent(app.getHttpServer());
    await registerAndLogin(
      otherAgent,
      `del-acl-other-${Date.now()}@example.com`,
    );
    const otherCsrf = await otherAgent.get('/auth/csrf').expect(200);
    await otherAgent
      .delete(`/resumes/${resumeId}`)
      .set('X-CSRF-Token', otherCsrf.body.data.csrfToken as string)
      .expect(404)
      .expect((res) => {
        expect(res.body.error.code).toBe('RESUME_NOT_FOUND');
        expect(res.body.requestId).toBeTruthy();
      });

    const ownerCsrf2 = await ownerAgent.get('/auth/csrf').expect(200);
    await ownerAgent
      .delete(`/resumes/00000000-0000-0000-0000-000000000001`)
      .set('X-CSRF-Token', ownerCsrf2.body.data.csrfToken as string)
      .expect(404)
      .expect((res) => {
        expect(res.body.error.code).toBe('RESUME_NOT_FOUND');
        expect(res.body.requestId).toBeTruthy();
      });

    await ownerAgent
      .delete(`/resumes/${resumeId}`)
      .expect(403)
      .expect((res) => {
        expect(res.body.error.code).toBe('CSRF_INVALID');
        expect(res.body.requestId).toBeTruthy();
      });
  });
});
