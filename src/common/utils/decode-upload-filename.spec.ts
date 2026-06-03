import { resolveUploadedOriginalName } from './decode-upload-filename';

describe('resolveUploadedOriginalName', () => {
  it('prefers explicit fileName from form body', () => {
    expect(
      resolveUploadedOriginalName('我的简历-zr-2023.pdf', 'broken.pdf'),
    ).toBe('我的简历-zr-2023.pdf');
  });

  it('decodes multer latin1 mojibake to utf-8', () => {
    const utf8 = '我的简历-zr-2023.pdf';
    const mojibake = Buffer.from(utf8, 'utf8').toString('latin1');
    expect(resolveUploadedOriginalName(undefined, mojibake)).toBe(utf8);
  });

  it('falls back when both missing', () => {
    expect(resolveUploadedOriginalName(undefined, undefined)).toBe('简历文件');
  });
});
