import { serializeDbTimestamp } from './serialize-db-timestamp';

describe('serializeDbTimestamp', () => {
  it('treats SQLite UTC strings as Z', () => {
    expect(serializeDbTimestamp('2026-06-03 05:30:00')).toBe(
      '2026-06-03T05:30:00.000Z',
    );
  });

  it('passes through Date as ISO', () => {
    const d = new Date('2026-06-03T05:30:00.000Z');
    expect(serializeDbTimestamp(d)).toBe('2026-06-03T05:30:00.000Z');
  });

  it('returns null for empty', () => {
    expect(serializeDbTimestamp(null)).toBeNull();
    expect(serializeDbTimestamp('')).toBeNull();
  });
});
