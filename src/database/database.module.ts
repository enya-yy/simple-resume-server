import { Global, Module } from '@nestjs/common';
import { join } from 'node:path';
import { PgLikePool, resolveSqliteFilePath } from '@simple-resume/sqlite-pg';
import { parseEnv } from '../config/env.schema';
import { APP_DB } from './app-db.token';

@Global()
@Module({
  providers: [
    {
      provide: APP_DB,
      useFactory: () => {
        const env = parseEnv(process.env);
        const monorepoRoot = join(__dirname, '../../../..');
        const full = resolveSqliteFilePath(
          env.SQLITE_DATABASE_PATH,
          monorepoRoot,
        );
        return PgLikePool.open(full);
      },
    },
  ],
  exports: [APP_DB],
})
export class DatabaseModule {}
