import { mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { buildExportFontFaceCss } from './exportFontFaceCss.js';

const renderDir = join(fileURLToPath(new URL('.', import.meta.url)));
const fontsDir = join(renderDir, 'fonts');
const stubFont = join(fontsDir, 'NotoSansSC-Regular.otf');

describe('buildExportFontFaceCss', () => {
  afterEach(() => {
    try {
      unlinkSync(stubFont);
    } catch {
      // ignore missing stub
    }
  });

  it('always emits a system CJK font-family fallback without bundled files', () => {
    // 不再下载字体：没有可内嵌的文件时也要输出 font-family，靠系统已装的 Noto CJK。
    const emptyRenderDir = mkdtempSync(join(tmpdir(), 'rp-fonts-'));
    const css = buildExportFontFaceCss(emptyRenderDir);
    expect(css).toContain('font-family: "Noto Sans SC"');
    expect(css).toContain('"Noto Sans CJK SC"');
    expect(css).toContain('!important');
    expect(css).not.toContain('local("Noto Sans SC")');
  });

  it('embeds bundled static font files via file:// when present', () => {
    mkdirSync(fontsDir, { recursive: true });
    writeFileSync(stubFont, 'stub');

    const css = buildExportFontFaceCss(renderDir);
    expect(css).toContain('@font-face');
    expect(css).toContain('font-family: "Noto Sans SC"');
    expect(css).toContain('file://');
    expect(css).toContain('!important');
    expect(css).not.toContain('local("Noto Sans SC")');
  });
});
