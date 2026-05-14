import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

const RESUME_MARKDOWN_SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'del',
    'code',
    'pre',
    'ul',
    'ol',
    'li',
    'blockquote',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'a',
    'span',
    'hr',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'rel', 'target'],
    th: ['align'],
    td: ['align'],
    code: ['class'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform(
      'a',
      { rel: 'noopener noreferrer', target: '_blank' },
      true,
    ),
  },
};

/**
 * 将用户输入的 Markdown 转为可安全用于 `v-html` / PDF 的 HTML。
 */
export function resumeMarkdownToSafeHtml(text: string): string {
  const raw = (text ?? '').trim();
  if (!raw) return '';
  const parsed = md.render(raw);
  return sanitizeHtml(parsed, RESUME_MARKDOWN_SANITIZE);
}
