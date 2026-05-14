import { ChatSessionsRepository } from './chat-sessions.repository';

function createMockPool() {
  return {
    query: jest.fn(),
  };
}

describe('ChatSessionsRepository', () => {
  let repo: ChatSessionsRepository;
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    pool = createMockPool();
    repo = new ChatSessionsRepository(pool as any);
  });

  describe('listByUser', () => {
    it('returns rows ordered by updated_at DESC for given userId', async () => {
      const rows = [
        {
          id: 's1',
          resume_id: 'r1',
          user_id: 'u1',
          title: '简历A',
          updated_at: new Date('2026-04-07'),
          last_message_summary: '',
        },
        {
          id: 's2',
          resume_id: 'r2',
          user_id: 'u1',
          title: '简历B',
          updated_at: new Date('2026-04-06'),
          last_message_summary: '',
        },
      ];
      pool.query.mockResolvedValue({ rows });

      const result = await repo.listByUser('u1');

      expect(result).toEqual(rows);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NULL'),
        ['u1'],
      );
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY updated_at DESC'),
        expect.any(Array),
      );
    });
  });

  describe('patchTitle', () => {
    it('updates title and returns updated session', async () => {
      const existing = { id: 's1', user_id: 'u1' };
      const updated = {
        id: 's1',
        resume_id: 'r1',
        user_id: 'u1',
        title: '新标题',
        updated_at: new Date(),
        last_message_summary: '',
      };
      pool.query
        .mockResolvedValueOnce({ rows: [existing] })
        .mockResolvedValueOnce({ rows: [updated] });

      const result = await repo.patchTitle('s1', 'u1', '新标题');

      expect(result).toEqual({ ok: true, session: updated });
    });

    it('returns NOT_FOUND when session does not exist', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await repo.patchTitle('nonexistent', 'u1', '标题');

      expect(result).toEqual({ ok: false, error: 'NOT_FOUND' });
    });

    it('returns FORBIDDEN when session belongs to another user', async () => {
      pool.query.mockResolvedValue({
        rows: [{ id: 's1', user_id: 'other-user' }],
      });

      const result = await repo.patchTitle('s1', 'u1', '标题');

      expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
    });
  });

  describe('softDelete', () => {
    it('soft-deletes session and returns ok', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: 's1', user_id: 'u1' }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await repo.softDelete('s1', 'u1');

      expect(result).toEqual({ ok: true });
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at = now()'),
        ['s1'],
      );
    });

    it('returns NOT_FOUND when session does not exist', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await repo.softDelete('nonexistent', 'u1');

      expect(result).toEqual({ ok: false, error: 'NOT_FOUND' });
    });

    it('returns FORBIDDEN when session belongs to another user', async () => {
      pool.query.mockResolvedValue({
        rows: [{ id: 's1', user_id: 'other-user' }],
      });

      const result = await repo.softDelete('s1', 'u1');

      expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
    });
  });

  describe('createForResume', () => {
    it('inserts and returns the new session row', async () => {
      const newRow = {
        id: 's-new',
        resume_id: 'r1',
        user_id: 'u1',
        title: '测试简历',
        updated_at: new Date(),
        last_message_summary: '',
      };
      pool.query.mockResolvedValue({ rows: [newRow] });

      const result = await repo.createForResume('u1', 'r1', '测试简历');

      expect(result).toEqual(newRow);
    });

    it('returns null when resume does not belong to user', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await repo.createForResume(
        'u1',
        'r-not-owned',
        '测试简历',
      );

      expect(result).toBeNull();
    });
  });
});
