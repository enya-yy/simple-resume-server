import { isPdfExtractedTextGarbled } from './pdf-text-quality';

describe('isPdfExtractedTextGarbled', () => {
  it('returns false for normal Chinese resume text', () => {
    const text =
      '张三 软件工程师 13800138000 zhang@example.com 工作经历 某科技公司 2020-2024 负责后端 API 开发 教育背景 北京大学 计算机科学 本科';
    expect(isPdfExtractedTextGarbled(text)).toBe(false);
  });

  it('returns false for English resume text', () => {
    const text =
      'John Doe Software Engineer john@example.com Experience Acme Corp 2020-2024 Built APIs and services Education MIT Computer Science';
    expect(isPdfExtractedTextGarbled(text)).toBe(false);
  });

  it('detects CID placeholder garbage from broken font mapping', () => {
    const text = Array.from({ length: 30 }, (_, i) => `(cid:${100 + i})`).join(' ');
    expect(isPdfExtractedTextGarbled(text)).toBe(true);
  });

  it('detects Latin-1 mojibake from Chinese PDFs', () => {
    const text =
      'ÿþÀÏÍõ ÏÈÉú Èí¼þ¹¤³ÌÊ¦ ÕÅÈý ·Ö¹«Ë¾ ¾­Àú ¹¤×÷ 2020 2024 ½ÌÓý ±³¾° ´óÑ§ ±¾¿Æ Éè¼Æ ¿ª·¢ Î¬»¤ ÏîÄ¿ ¼¼ÄÜ Java Python SQL';
    expect(isPdfExtractedTextGarbled(text)).toBe(true);
  });
});
