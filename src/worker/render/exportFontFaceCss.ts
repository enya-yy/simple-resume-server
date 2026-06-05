import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type FontWeightSlot = 400 | 700;

type ExportFontSpec = {
  family: string;
  regular: string[];
  bold: string[];
};

const EXPORT_FONTS: ExportFontSpec[] = [
  {
    family: 'Noto Sans SC',
    regular: [
      'NotoSansSC-Regular.otf',
      'NotoSansCJK-Regular.ttc',
      'NotoSansCJKsc-Regular.otf',
    ],
    bold: ['NotoSansSC-Bold.otf', 'NotoSansCJK-Bold.ttc', 'NotoSansCJKsc-Bold.otf'],
  },
  {
    family: 'Noto Serif SC',
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
];

function resolveBundledFontDir(renderDir: string): string {
  return join(renderDir, 'fonts');
}

function resolveFontFileUrl(
  renderDir: string,
  filenames: string[],
): string | null {
  const bundledDir = resolveBundledFontDir(renderDir);
  const candidates: string[] = [];
  for (const name of filenames) {
    candidates.push(join(bundledDir, name));
    for (const dir of SYSTEM_FONT_DIRS) {
      candidates.push(join(dir, name));
    }
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

function fontFormat(url: string): string {
  const lower = url.toLowerCase();
  if (lower.endsWith('.ttc')) {
    return 'truetype';
  }
  return 'opentype';
}

function fontFaceRule(params: {
  family: string;
  url: string;
  weight: FontWeightSlot;
}): string {
  return `@font-face {
  font-family: "${params.family}";
  src: url("${params.url}") format("${fontFormat(params.url)}");
  font-weight: ${params.weight};
  font-style: normal;
  font-display: block;
}`;
}

/** PDF 导出用本地字体文件，避免依赖 Google Fonts 或 local() 名称匹配。 */
export function buildExportFontFaceCss(renderDir: string): string {
  const rules: string[] = [];
  for (const spec of EXPORT_FONTS) {
    const regularUrl = resolveFontFileUrl(renderDir, spec.regular);
    const boldUrl = resolveFontFileUrl(renderDir, spec.bold);
    if (regularUrl) {
      rules.push(fontFaceRule({ family: spec.family, url: regularUrl, weight: 400 }));
    }
    if (boldUrl) {
      rules.push(fontFaceRule({ family: spec.family, url: boldUrl, weight: 700 }));
    }
  }
  if (rules.length === 0) {
    return '';
  }
  return `${rules.join('\n')}
.rp-root,
.rp-root * {
  font-family: "Noto Sans SC", "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif !important;
}
.rp-root.rp-tpl-editorial-gold,
.rp-root.rp-tpl-editorial-gold * {
  font-family: "Noto Serif SC", "Noto Serif CJK SC", "Songti SC", "Noto Sans SC", serif !important;
}
`;
}
