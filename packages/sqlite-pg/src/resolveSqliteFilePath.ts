import { isAbsolute, resolve } from 'node:path';

/**
 * 将环境变量中的路径解析为绝对路径：绝对路径原样；否则相对 **仓库根**（与 `server/`、`server/worker/` 的 cwd 无关）。
 */
export function resolveSqliteFilePath(
  pathFromEnv: string,
  monorepoRoot: string,
): string {
  const p = pathFromEnv.trim();
  if (isAbsolute(p)) return p;
  return resolve(monorepoRoot, p);
}
