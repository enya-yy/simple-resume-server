import { config } from 'dotenv';
import { resolve } from 'node:path';

// 仓库根 .env 优先，再 server/.env 覆盖
config({ path: resolve(__dirname, '../../../.env') });
config({ path: resolve(__dirname, '../.env') });
