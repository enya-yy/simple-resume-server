import { EMPTY_RESUME_DOCUMENT } from '../../schemas/resume.schema';
import type { ResumeDocument } from '../../types/resume';
import {
  analyzeResumeCompletion,
  buildResumeAgentContext,
} from '../resume-completion';

describe('analyzeResumeCompletion', () => {
  it('reports low score for empty resume', () => {
    const analysis = analyzeResumeCompletion(
      EMPTY_RESUME_DOCUMENT as ResumeDocument,
    );
    expect(analysis.scorePercent).toBeLessThan(50);
    expect(analysis.missingBasics.length).toBeGreaterThan(0);
    expect(analysis.suggestionPhrases.length).toBeGreaterThan(0);
  });

  it('buildResumeAgentContext includes catalog and completion', () => {
    const doc = EMPTY_RESUME_DOCUMENT as ResumeDocument;
    const ctx = buildResumeAgentContext(doc, '## catalog');
    expect(ctx).toContain('## catalog');
    expect(ctx).toContain('完成度');
  });
});
