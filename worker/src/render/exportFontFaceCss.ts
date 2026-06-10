import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type FontWeightSlot = 400 | 700;

type ExportFontSpec = {
  family: string;
  /** 可变字体：一份文件覆盖全字重，优先使用，内嵌后体积/字重最稳定 */
  variable: string[];
  regular: string[];
  bold: string[];
};

const EXPORT_FONTS: ExportFontSpec[] = [
  {
    family: 'Noto Sans SC',
    variable: ['NotoSansSC.ttf', 'NotoSansSC[wght].ttf', 'NotoSansSC-VF.ttf'],
    regular: [
      'NotoSansSC-Regular.otf',
      'NotoSansCJK-Regular.ttc',
      'NotoSansCJKsc-Regular.otf',
    ],
    bold: ['NotoSansSC-Bold.otf', 'NotoSansCJK-Bold.ttc', 'NotoSansCJKsc-Bold.otf'],
  },
  {
    family: 'Noto Serif SC',
    variable: ['NotoSerifSC.ttf', 'NotoSerifSC[wght].ttf', 'NotoSerifSC-VF.ttf'],
    regular: [
      'NotoSerifSC-Regular.otf',
      'NotoSerifCJK-Regular.ttc',
      'NotoSerifCJKsc-Regular.otf',
    ],
    bold: [
      'NotoSerifSC-Bold.otf',
      'NotoSerifCJK-Bold.ttc',
      'NotoSerifCJKsc-Bold.otf',
    ],
  },
];

const SYSTEM_FONT_DIRS = [
  '/usr/share/fonts/opentype/noto',
  '/usr/share/fonts/truetype/noto',
  '/usr/share/fonts/noto-cjk',
  '/usr/share/fonts/google-noto-cjk',
  '/usr/share/fonts/opentype/noto-cjk',
];

/**
 * 内置字体可能落在两个 worker 各自的目录里（API 内嵌 worker 与独立 worker
 * 都会处理导出任务）。从 render 目录回推 server 根目录后，统一覆盖两者的
 * 源码/构建产物字体目录，这样仓库里只需保存一份字体文件。
 */
function bundledFontDirs(renderDir: string): string[] {
  const serverRoot = join(renderDir, '..', '..', '..');
  return [
    join(renderDir, 'fonts'),
    join(serverRoot, 'worker', 'dist', 'render', 'fonts'),
    join(serverRoot, 'worker', 'src', 'render', 'fonts'),
    join(serverRoot, 'dist', 'worker', 'render', 'fonts'),
    join(serverRoot, 'src', 'worker', 'render', 'fonts'),
  ];
}

function resolveFontFileUrl(
  dirs: string[],
  filenames: string[],
): string | null {
  for (const name of filenames) {
    for (const dir of dirs) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) {
        return pathToFileURL(candidate).href;
      }
    }
  }
  return null;
}

function variableFontFaceRule(params: { family: string; url: string }): string {
  return `@font-face {
  font-family: "${params.family}";
  src: url("${params.url}");
  font-weight: 100 900;
  font-style: normal;
  font-display: block;
}`;
}

function fontFaceRule(params: {
  family: string;
  url: string;
  weight: FontWeightSlot;
}): string {
  return `@font-face {
  font-family: "${params.family}";
  src: url("${params.url}");
  font-weight: ${params.weight};
  font-style: normal;
  font-display: block;
}`;
}

/**
 * 字体策略：不再下载字体文件，直接用部署机系统安装的 Noto CJK（apt fonts-noto-cjk）。
 * 若恰好在 bundled/系统目录找到字体文件则内嵌 @font-face（保真度更高）；找不到也
 * 始终输出 font-family，让 Chrome 按名字匹配系统已装的 CJK 字体。
 */
export function buildExportFontFaceCss(renderDir: string): string {
  const rules: string[] = [];
  const bundledDirs = bundledFontDirs(renderDir);
  for (const spec of EXPORT_FONTS) {
    const systemRegularUrl = resolveFontFileUrl(SYSTEM_FONT_DIRS, spec.regular);
    const systemBoldUrl = resolveFontFileUrl(SYSTEM_FONT_DIRS, spec.bold);
    if (systemRegularUrl || systemBoldUrl) {
      if (systemRegularUrl) {
        rules.push(
          fontFaceRule({
            family: spec.family,
            url: systemRegularUrl,
            weight: 400,
          }),
        );
      }
      if (systemBoldUrl) {
        rules.push(
          fontFaceRule({ family: spec.family, url: systemBoldUrl, weight: 700 }),
        );
      }
      continue;
    }

    const variableUrl = resolveFontFileUrl(bundledDirs, spec.variable);
    if (variableUrl) {
      rules.push(variableFontFaceRule({ family: spec.family, url: variableUrl }));
      continue;
    }
    const regularUrl = resolveFontFileUrl(bundledDirs, spec.regular);
    const boldUrl = resolveFontFileUrl(bundledDirs, spec.bold);
    if (regularUrl) {
      rules.push(
        fontFaceRule({ family: spec.family, url: regularUrl, weight: 400 }),
      );
    }
    if (boldUrl) {
      rules.push(
        fontFaceRule({ family: spec.family, url: boldUrl, weight: 700 }),
      );
    }
  }
  const faceCss = rules.length > 0 ? `${rules.join('\n')}\n` : '';
  return `${faceCss}.rp-root,
.rp-root * {
  font-family: "Noto Sans SC", "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif !important;
}
.rp-root.rp-tpl-editorial-gold,
.rp-root.rp-tpl-editorial-gold * {
  font-family: "Noto Serif SC", "Noto Serif CJK SC", "Songti SC", "Noto Sans SC", serif !important;
}
`;
}
