import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fontsDir = join(serverRoot, 'worker/src/render/fonts');

/** 构建/部署时拉取，避免把 ~40MB 字体提交进 Git */
const FONTS = [
  {
    name: 'NotoSansSC.ttf',
    url: 'https://github.com/notofonts/noto-cjk/raw/refs/heads/main/Sans/Variable/TTF/Subset/NotoSansSC-VF.ttf',
  },
  {
    name: 'NotoSerifSC.ttf',
    url: 'https://github.com/notofonts/noto-cjk/raw/refs/heads/main/Serif/Variable/TTF/Subset/NotoSerifSC-VF.ttf',
  },
];

async function fetchFont({ name, url }) {
  mkdirSync(fontsDir, { recursive: true });
  const dest = join(fontsDir, name);
  if (existsSync(dest)) {
    console.log(`[fonts] skip ${name} (already present)`);
    return;
  }
  console.log(`[fonts] downloading ${name}...`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`[fonts] failed to download ${url}: HTTP ${res.status}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, bytes);
  console.log(`[fonts] wrote ${dest} (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`);
}

for (const font of FONTS) {
  await fetchFont(font);
}
