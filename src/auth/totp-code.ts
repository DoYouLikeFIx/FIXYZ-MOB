export const sanitizeOtpCodeInput = (value: string) =>
  value.replace(/\D/g, '').slice(0, 6);

export const isCompleteOtpCode = (value: string) =>
  /^\d{6}$/.test(value);
