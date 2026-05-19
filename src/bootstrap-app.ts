import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import helmet from 'helmet';
import type { PgLikePool } from '@simple-resume/sqlite-pg';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { requestIdMiddleware } from './common/request-id';
import { TransformInterceptor } from './common/transform.interceptor';
import { parseEnv } from './config/env.schema';
import { APP_DB } from './database/app-db.token';
import { createSqliteSessionStore } from './database/sqlite-session-store';
import type { EnvConfig } from './config/env.schema';

function resolveSessionCookieSecure(
  env: EnvConfig,
): boolean | 'auto' {
  if (env.SESSION_COOKIE_SECURE === 'true') return true;
  if (env.SESSION_COOKIE_SECURE === 'false') return false;
  if (env.SESSION_COOKIE_SECURE === 'auto') return 'auto';
  return env.NODE_ENV === 'production' ? 'auto' : false;
}

function shouldTrustProxy(env: EnvConfig): boolean {
  if (env.TRUST_PROXY === 'true') return true;
  if (env.TRUST_PROXY === 'false') return false;
  return env.NODE_ENV === 'production';
}

export async function configureHttpApp(app: INestApplication): Promise<void> {
  const env = parseEnv(process.env);
  const pool = app.get<PgLikePool>(APP_DB);
  const corsOrigins = env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  if (corsOrigins.length === 0) {
    throw new Error('CORS_ORIGINS must include at least one origin');
  }

  const expressApp = app.getHttpAdapter().getInstance();
  if (shouldTrustProxy(env)) {
    expressApp.set('trust proxy', 1);
  }

  app.use(helmet());
  app.use(requestIdMiddleware);
  app.use(cookieParser());

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  const sessionStore = createSqliteSessionStore(session, pool.raw);
  app.use(
    session({
      store: sessionStore,
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      name: 'sid',
      cookie: {
        httpOnly: true,
        sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
        secure: resolveSessionCookieSecure(env),
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
      proxy: shouldTrustProxy(env),
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
}
