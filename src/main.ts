import './load-local-env';
import { NestFactory } from '@nestjs/core';
import type { PgLikePool } from '@simple-resume/sqlite-pg';
import { AppModule } from './app.module';
import { configureHttpApp } from './bootstrap-app';
import { parseEnv } from './config/env.schema';
import { APP_DB } from './database/app-db.token';
import { startInProcessWorker } from './worker/in-process-worker';

async function bootstrap() {
  const env = parseEnv(process.env);
  const app = await NestFactory.create(AppModule);
  await configureHttpApp(app);
  const pool = app.get<PgLikePool>(APP_DB);
  const inlineWorker = startInProcessWorker(pool);
  let stopped = false;
  const stopWorker = () => {
    if (stopped) return;
    stopped = true;
    inlineWorker.stop();
  };
  app.enableShutdownHooks();
  process.on('SIGINT', stopWorker);
  process.on('SIGTERM', stopWorker);
  await app.listen(env.API_PORT, env.API_HOST);
}

bootstrap();
