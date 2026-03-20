import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { resolveMfaErrorPresentation } from '../../auth/auth-errors';
import { isCompleteOtpCode, sanitizeOtpCodeInput } from '../../auth/totp-code';
import { useExpiryCountdown } from '../../auth/use-expiry-countdown';
import { AuthField } from '../../components/auth/AuthField';
import { AuthScaffold } from '../../components/auth/AuthScaffold';
import type { LoginChallenge, TotpVerificationRequest } from '../../types/auth';
import type { FormSubmissionResult } from '../../types/auth-ui';
import { authSharedStyles as styles } from '../../components/auth/auth-styles';

interface LoginMfaScreenProps {
  bannerMessage?: string | null;
  bannerTone?: 'info' | 'error' | 'success';
  challenge: LoginChallenge;
  onForgotPasswordPress: () => void;
  onLoginPress: () => void;
  onRegisterPress: () => void;
  onRestartLogin: () => void;
  onSubmit: (payload: TotpVerificationRequest) => Promise<FormSubmissionResult>;
}

export const LoginMfaScreen = ({
  bannerMessage,
  bannerTone,
  challenge,
  onForgotPasswordPress,
  onLoginPress,
  onRegisterPress,
  onRestartLogin,
  onSubmit,
}: LoginMfaScreenProps) => {
  const [otpCode, setOtpCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const countdown = useExpiryCountdown(challenge.expiresAt);

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    const normalizedOtp = sanitizeOtpCodeInput(otpCode);

    if (!isCompleteOtpCode(normalizedOtp)) {
      setErrorMessage('인증 코드는 숫자 6자리로 입력해 주세요.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await onSubmit({
        loginToken: challenge.loginToken,
        otpCode: normalizedOtp,
      });

      if (!result.success) {
        setErrorMessage(resolveMfaErrorPresentation(result.error).message);
      }
    } catch (error) {
      setErrorMessage(resolveMfaErrorPresentation(error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthScaffold
      bannerMessage={bannerMessage}
      bannerTone={bannerTone}
      mode="login"
      onLoginPress={onLoginPress}
      onRegisterPress={onRegisterPress}
      showModeToggle={false}
      subtitle="비밀번호 확인 후 Google Authenticator의 현재 6자리 코드를 입력해 주세요."
      title="보안 인증을 완료해 주세요"
    >
      <View style={styles.inlineInfoCard} testID="login-mfa-guidance">
        <Text style={styles.inlineInfoTitle}>비밀번호 확인이 완료되었습니다.</Text>
        <Text style={styles.inlineInfoBody}>
          현재 Google Authenticator 앱에 표시된 6자리 코드를 입력하면 로그인이 완료됩니다.
        </Text>
        <Text style={styles.inlineInfoDetail}>
          인증 단계 만료: {countdown.expiresAtLabel} · {countdown.remainingLabel}
        </Text>
      </View>
      <AuthField
        errorMessage={errorMessage ?? undefined}
        keyboardType="numeric"
        label="인증 코드"
        onChangeText={(value) => {
          setErrorMessage(null);
          setOtpCode(sanitizeOtpCodeInput(value));
        }}
        placeholder="6자리 코드"
        supportMessage="코드는 약 30초마다 바뀝니다."
        testID="login-mfa-input"
        textContentType="oneTimeCode"
        value={otpCode}
      />
      <Pressable
        disabled={isSubmitting}
        onPress={() => {
          void handleSubmit();
        }}
        style={[
          styles.primaryButton,
          isSubmitting ? styles.primaryButtonDisabled : null,
        ]}
        testID="login-mfa-submit"
      >
        <Text style={styles.primaryButtonText}>
          {isSubmitting ? '인증 중...' : '인증 완료'}
        </Text>
      </Pressable>
      <View style={styles.secondaryLinkWrap}>
        <Pressable
          onPress={onRestartLogin}
          style={styles.secondaryLinkButton}
          testID="login-mfa-reset"
        >
          <Text style={styles.secondaryLinkText}>비밀번호 다시 입력</Text>
        </Pressable>
      </View>
      <View style={styles.secondaryLinkWrap}>
        <Pressable
          onPress={onForgotPasswordPress}
          style={styles.secondaryLinkButton}
          testID="login-mfa-open-password-recovery"
        >
          <Text style={styles.secondaryLinkText}>비밀번호 재설정 안내 보기</Text>
        </Pressable>
      </View>
    </AuthScaffold>
  );
};
