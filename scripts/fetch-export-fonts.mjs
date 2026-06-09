import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fontsDir = join(serverRoot, 'worker/src/render/fonts');

const PER_URL_TIMEOUT_MS = 30_000;

/**
 * 构建/部署时拉取，避免把 ~40MB 字体提交进 Git。
 *
 * 测试机在国内，直连 github.com 常超时（UND_ERR_CONNECT_TIMEOUT），会让
 * `pnpm fetch-fonts && nest build` 整条 build 失败。这里按顺序尝试多个国内
 * 可达的镜像；全部失败时仅告警、不中断 build——导出会回退到部署脚本 apt
 * 安装的系统 fonts-noto-cjk（见 exportFontFaceCss 的 SYSTEM_FONT_DIRS）。
 *
 * 可用 EXPORT_FONTS_BASE_URL 覆盖镜像前缀（指向 noto-cjk 仓库根）。
 */
const NOTO_CJK_REPO_PATH = {
  sans: 'Sans/Variable/TTF/Subset/NotoSansSC-VF.ttf',
  serif: 'Serif/Variable/TTF/Subset/NotoSerifSC-VF.ttf',
};

function mirrorUrls(repoPath) {
  const override = process.env.EXPORT_FONTS_BASE_URL?.trim();
  const bases = [
    // jsDelivr：国内可达性较好，但单文件 >~20MB 会 403（serif 走代理兜底）
    'https://fastly.jsdelivr.net/gh/notofonts/noto-cjk@main/',
    'https://gcore.jsdelivr.net/gh/notofonts/noto-cjk@main/',
    'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/',
    // github 大文件代理（支持 >20MB，国内可达）
    'https://ghfast.top/https://github.com/notofonts/noto-cjk/raw/refs/heads/main/',
    'https://gh-proxy.com/https://github.com/notofonts/noto-cjk/raw/refs/heads/main/',
    'https://ghproxy.net/https://github.com/notofonts/noto-cjk/raw/refs/heads/main/',
    // 直连兜底（测试机国内通常超时）
    'https://github.com/notofonts/noto-cjk/raw/refs/heads/main/',
  ];
  if (override) {
    bases.unshift(override.endsWith('/') ? override : `${override}/`);
  }
  return bases.map((base) => `${base}${repoPath}`);
}

const FONTS = [
  { name: 'NotoSansSC.ttf', urls: mirrorUrls(NOTO_CJK_REPO_PATH.sans) },
  { name: 'NotoSerifSC.ttf', urls: mirrorUrls(NOTO_CJK_REPO_PATH.serif) },
];

async function downloadFrom(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_URL_TIMEOUT_MS);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFont({ name, urls }) {
  mkdirSync(fontsDir, { recursive: true });
  const dest = join(fontsDir, name);
  if (existsSync(dest)) {
    console.log(`[fonts] skip ${name} (already present)`);
    return true;
  }
  for (const url of urls) {
    console.log(`[fonts] downloading ${name} from ${url}`);
    try {
      const bytes = await downloadFrom(url);
      writeFileSync(dest, bytes);
      console.log(
        `[fonts] wrote ${dest} (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`,
      );
      return true;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[fonts] failed ${url}: ${reason}`);
    }
  }
  return false;
}

const failed = [];
for (const font of FONTS) {
  const ok = await fetchFont(font);
  if (!ok) {
    failed.push(font.name);
  }
}

if (failed.length > 0) {
  console.warn(
    `[fonts] WARNING: could not download ${failed.join(', ')} from any mirror. ` +
      'Build continues; PDF export will fall back to the system fonts-noto-cjk ' +
      'installed by the deploy script.',
  );
}
