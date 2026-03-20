import { describe, expect, it } from 'vitest';
import { resolveAuthErrorPresentation } from '@/auth/auth-errors';

describe('resolveAuthErrorPresentation', () => {
  it('adds retry-after guidance for recovery challenge bootstrap failures', () => {
    const presentation = resolveAuthErrorPresentation({
      code: 'AUTH-023',
      message: 'bootstrap unavailable',
      retryAfterSeconds: 45,
    } as any);

    expect(presentation.message).toContain('다시 시도');
    expect(presentation.message).toContain('45');
  });

  it('adds retry-after guidance for recovery challenge verification failures', () => {
    const presentation = resolveAuthErrorPresentation({
      code: 'AUTH-025',
      message: 'verify unavailable',
      retryAfterSeconds: 30,
    } as any);

    expect(presentation.message).toContain('다시 시도');
    expect(presentation.message).toContain('30');
  });
});
