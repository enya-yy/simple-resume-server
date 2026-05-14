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

export async function configureHttpApp(app: INestApplication): Promise<void> {
  const env = parseEnv(process.env);
  const pool = app.get<PgLikePool>(APP_DB);
  const corsOrigins = env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  if (corsOrigins.length === 0) {
    throw new Error('CORS_ORIGINS must include at least one origin');
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
        secure: env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
}
