import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
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

  it('embeds bundled font files via file:// when present', () => {
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
