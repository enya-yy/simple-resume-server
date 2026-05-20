import { z } from 'zod';
import {
  DASHSCOPE_DEFAULT_BASE_URL,
  DASHSCOPE_DEFAULT_MODEL,
} from '../contracts/index';

/** `.env` 里常见的 `KEY=` 空串：在可选字段上视为未设置，避免 `z.string().url()` 等对 `""` 校验失败 */
function emptyToUndefined<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((val: unknown) => {
    if (val === '' || val === null) return undefined;
    return val;
  }, schema);
}

export function defaultSqliteDatabasePath(nodeEnv: string | undefined): string {
  return nodeEnv === 'production'
    ? '/home/ubuntu/projects/simple-resume/db/simple-resume.db'
    : 'local-db/simple-resume.db';
}

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    API_HOST: z.string().default('0.0.0.0'),
    API_PORT: z.coerce.number().int().positive().default(3000),
    /**
     * SQLite 文件路径：以 `/` 开头为绝对路径；否则相对**仓库根目录**（与 Worker 须一致，且与在 `server/` 或 `server/worker/` 下启动无关）。
     * 未设置时：开发环境为 `local-db/simple-resume.db`，生产环境为服务器持久化目录。
     */
    SQLITE_DATABASE_PATH: emptyToUndefined(z.string().min(1)).optional(),
    SESSION_SECRET: z
      .string()
      .min(32, 'SESSION_SECRET 至少需要 32 个字符')
      .default('dev-session-secret-change-me-min-32-chars!!'),
    /** 逗号分隔的前端源，用于 CORS 白名单 */
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173,http://127.0.0.1:5173'),
    /**
     * Session cookie `Secure`：未设置时 production 为 `auto`（随连接是否 HTTPS），其它环境为 false。
     * 测试机仅 HTTP 时可显式设为 `false`。
     */
    SESSION_COOKIE_SECURE: z
      .enum(['true', 'false', 'auto'])
      .optional(),
    /** 置于 nginx 等反向代理后时解析 X-Forwarded-*（默认 production 开启） */
    TRUST_PROXY: z.enum(['true', 'false']).optional(),
    /** 分享链接展示使用的前端公开域名（未设置时回退到 CORS_ORIGINS 第一项） */
    WEB_PUBLIC_ORIGIN: emptyToUndefined(z.string().url()).optional(),
    /** S3 兼容存储（生产/本地 MinIO）；用于导出 PDF 预签名下载 */
    S3_ENDPOINT: emptyToUndefined(z.string().url()).optional(),
    S3_REGION: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? undefined : v),
      z.string().min(1).default('us-east-1'),
    ),
    S3_BUCKET: emptyToUndefined(z.string().min(1)).optional(),
    S3_ACCESS_KEY_ID: emptyToUndefined(z.string().min(1)).optional(),
    S3_SECRET_ACCESS_KEY: emptyToUndefined(z.string().min(1)).optional(),
    /** MinIO 等需 path-style（未设置视为 false） */
    S3_FORCE_PATH_STYLE: z
      .string()
      .optional()
      .transform((v) => v === 'true'),
    /** 预签名 URL 有效期（秒） */
    S3_DOWNLOAD_URL_TTL_SECONDS: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? undefined : v),
      z.coerce.number().int().positive().default(900),
    ),
    /**
     * e2e / 无真实存储时：返回固定形态的 downloadUrl（不访问网络）
     */
    EXPORT_PRESIGN_STUB: z
      .string()
      .optional()
      .transform((v) => v === 'true'),
    /**
     * 运营聚合接口（`/ops/*`）访问令牌；未设置时该路由返回不可用。
     * 禁止提交到前端构建产物。
     */
    OPS_METRICS_TOKEN: emptyToUndefined(z.string().min(8)).optional(),

    // LLM Provider
    LLM_PROVIDER: z.enum(['dashscope', 'stub']).default('stub'),
    DASHSCOPE_API_KEY: emptyToUndefined(z.string().min(1)).optional(),
    DASHSCOPE_BASE_URL: emptyToUndefined(z.string().url()).default(
      DASHSCOPE_DEFAULT_BASE_URL,
    ),
    DASHSCOPE_MODEL: z.string().default(DASHSCOPE_DEFAULT_MODEL),
    DASHSCOPE_INTENT_MODEL: z.string().default(DASHSCOPE_DEFAULT_MODEL),

    // LLM Timeouts (ms)
    LLM_FIRST_BYTE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(15000),
    LLM_STREAM_IDLE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(10000),
    LLM_STREAM_MAX_DURATION_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(120000),

    // Intent Dispatcher
    LLM_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.6),
    /** 为 true 时在 PM2 日志与 SSE 流中输出 LLM 调用调试信息 */
    LLM_DEBUG: z
      .string()
      .optional()
      .transform((v) => v === 'true'),
  })
  .superRefine((env, ctx) => {
    if (env.LLM_PROVIDER === 'dashscope' && !env.DASHSCOPE_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DASHSCOPE_API_KEY'],
        message: 'LLM_PROVIDER=dashscope 时必须设置 DASHSCOPE_API_KEY',
      });
    }
  })
  .transform((env) => ({
    ...env,
    SQLITE_DATABASE_PATH:
      env.SQLITE_DATABASE_PATH ?? defaultSqliteDatabasePath(env.NODE_ENV),
  }));

export type EnvConfig = z.infer<typeof envSchema>;

export function parseEnv(input: NodeJS.ProcessEnv): EnvConfig {
  return envSchema.parse(input);
}
