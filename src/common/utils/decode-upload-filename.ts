const MAX_FILENAME_LEN = 255;

/**
 * 浏览器 FormData 的 `fileName` 字段优先；否则尝试把 Multer latin1 字节还原为 UTF-8。
 */
export function resolveUploadedOriginalName(
  bodyFileName?: string,
  multerOriginalname?: string,
): string {
  const fromBody =
    typeof bodyFileName === 'string' ? bodyFileName.trim() : '';
  if (fromBody) {
    return fromBody.slice(0, MAX_FILENAME_LEN);
  }

  const raw = multerOriginalname?.trim() ?? '';
  if (!raw) {
    return '简历文件';
  }

  try {
    const decoded = Buffer.from(raw, 'latin1').toString('utf8').trim();
    if (decoded && !decoded.includes('\uFFFD')) {
      return decoded.slice(0, MAX_FILENAME_LEN);
    }
  } catch {
    /* keep raw */
  }

  return raw.slice(0, MAX_FILENAME_LEN);
}
