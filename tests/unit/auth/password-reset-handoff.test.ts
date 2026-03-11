import { extractPasswordResetTokenFromUrl } from '@/auth/password-reset-handoff';

describe('password reset handoff parser', () => {
  it('extracts the reset token from supported reset-password links', () => {
    expect(
      extractPasswordResetTokenFromUrl('fixyz://reset-password?token=raw-token'),
    ).toBe('raw-token');
    expect(
      extractPasswordResetTokenFromUrl('https://fixyz.app/password-reset?resetToken=alt-token'),
    ).toBe('alt-token');
    expect(
      extractPasswordResetTokenFromUrl('fixyz://password-reset?token=fragment-token#ignored'),
    ).toBe('fragment-token');
  });

  it('ignores unrelated or malformed links', () => {
    expect(extractPasswordResetTokenFromUrl('fixyz://portfolio?token=raw-token')).toBeNull();
    expect(extractPasswordResetTokenFromUrl('not a url')).toBeNull();
    expect(extractPasswordResetTokenFromUrl(null)).toBeNull();
  });
});
