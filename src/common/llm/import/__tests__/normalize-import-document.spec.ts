import {
  normalizeImportBullets,
  normalizeImportedDocument,
  parseJsonFromLlmResponse,
} from '../normalize-import-document';

describe('normalizeImportBullets', () => {
  it('splits bullets longer than 300 chars', () => {
    const long = '负责'.repeat(200);
    const bullets = normalizeImportBullets([long]);
    expect(bullets.length).toBeGreaterThan(1);
    expect(bullets.every((b) => b.length <= 300)).toBe(true);
  });
});

describe('normalizeImportedDocument', () => {
  it('assigns UUIDs and coerces module types', () => {
    const doc = normalizeImportedDocument({
      basics: {
        fullName: '张三',
        email: 'zhang@example.com',
      },
      sections: [
        {
          type: 'invalid',
          title: '工作经历',
          items: [{ title: '某公司 · 工程师', bullets: ['负责开发'] }],
        },
      ],
    });

    expect(doc.basics.fullName).toBe('张三');
    expect(doc.sections[0]?.type).toBe('custom');
    expect(doc.sections[0]?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(doc.sections[0]?.items[0]?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});

describe('parseJsonFromLlmResponse', () => {
  it('parses fenced JSON', () => {
    const raw = parseJsonFromLlmResponse(
      '```json\n{"basics":{"fullName":"李四"}}\n```',
    ) as { basics: { fullName: string } };
    expect(raw.basics.fullName).toBe('李四');
  });
});
