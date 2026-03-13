import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { resolveMfaErrorPresentation } from '../../auth/auth-errors';
import { isCompleteOtpCode, sanitizeOtpCodeInput } from '../../auth/totp-code';
import { useExpiryCountdown } from '../../auth/use-expiry-countdown';
import { AuthField } from '../../components/auth/AuthField';
import { AuthScaffold } from '../../components/auth/AuthScaffold';
import { authSharedStyles as styles, palette } from '../../components/auth/auth-styles';
import type {
  MfaRecoveryRebindConfirmRequest,
  TotpRebindBootstrap,
} from '../../types/auth';
import type { MfaRecoveryRebindConfirmationResult } from '../../types/auth-ui';

interface MfaRecoveryRebindScreenProps {
  bootstrap: TotpRebindBootstrap;
  onLoginPress: () => void;
  onRegisterPress: () => void;
  onRestartRecovery: () => void;
  onSubmit: (
    payload: MfaRecoveryRebindConfirmRequest,
  ) => Promise<MfaRecoveryRebindConfirmationResult>;
}

export const MfaRecoveryRebindScreen = ({
  bootstrap,
  onLoginPress,
  onRegisterPress,
  onRestartRecovery,
  onSubmit,
}: MfaRecoveryRebindScreenProps) => {
  const [otpCode, setOtpCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const countdown = useExpiryCountdown(bootstrap.expiresAt);

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    const normalizedOtp = sanitizeOtpCodeInput(otpCode);

    if (!isCompleteOtpCode(normalizedOtp)) {
      setErrorMessage('현재 인증 코드는 숫자 6자리로 입력해 주세요.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await onSubmit({
        rebindToken: bootstrap.rebindToken,
        enrollmentToken: bootstrap.enrollmentToken,
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

  const handleOpenAuthenticator = async () => {
    setErrorMessage(null);

    try {
      await Linking.openURL(bootstrap.qrUri);
    } catch {
      setErrorMessage('인증 앱을 열지 못했습니다. 아래 수동 입력 키를 사용해 직접 등록해 주세요.');
    }
  };

  return (
    <AuthScaffold
      bannerMessage="복구가 완료되면 기존 로그인 상태는 모두 해제되고 새 authenticator로 다시 로그인해야 합니다."
      bannerTone="info"
      mode="login"
      onLoginPress={onLoginPress}
      onRegisterPress={onRegisterPress}
      showModeToggle={false}
      subtitle="새 authenticator 앱에 계정을 추가한 뒤 현재 6자리 코드를 확인하면 복구가 완료됩니다."
      title="새 authenticator 연결"
    >
      <View style={panelStyles.card}>
        <Text style={panelStyles.title}>앱으로 바로 열기</Text>
        <Text style={panelStyles.body}>
          Google Authenticator가 같은 기기에 설치되어 있다면 아래 버튼으로 바로 열 수 있습니다.
        </Text>
        <Pressable
          onPress={() => {
            void handleOpenAuthenticator();
          }}
          style={styles.secondaryLinkButton}
          testID="mfa-recovery-open-authenticator"
        >
          <Text style={styles.secondaryLinkText}>Google Authenticator 열기</Text>
        </Pressable>
      </View>

      <View style={panelStyles.card}>
        <Text style={panelStyles.title}>수동 입력 키</Text>
        <Text style={panelStyles.body}>
          QR 등록이 어렵다면 아래 키를 앱에 직접 입력해도 됩니다.
        </Text>
        <View style={panelStyles.codeBlock}>
          <Text selectable style={panelStyles.manualKey} testID="mfa-recovery-manual-key">
            {bootstrap.manualEntryKey}
          </Text>
        </View>
        <Text style={styles.inlineInfoDetail} testID="mfa-recovery-expiry">
          복구 단계 만료: {countdown.expiresAtLabel} · {countdown.remainingLabel}
        </Text>
      </View>

      <AuthField
        errorMessage={errorMessage ?? undefined}
        keyboardType="numeric"
        label="현재 6자리 코드 확인"
        onChangeText={(value) => {
          setErrorMessage(null);
          setOtpCode(sanitizeOtpCodeInput(value));
        }}
        placeholder="6자리 코드"
        supportMessage="앱에 새 계정이 추가되면 현재 표시된 6자리 코드를 입력해 주세요."
        testID="mfa-recovery-code"
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
        testID="mfa-recovery-confirm-submit"
      >
        <Text style={styles.primaryButtonText}>
          {isSubmitting ? '복구 확인 중...' : '새 authenticator 등록 완료'}
        </Text>
      </Pressable>

      <View style={styles.secondaryLinkWrap}>
        <Pressable
          onPress={onRestartRecovery}
          style={styles.secondaryLinkButton}
          testID="mfa-recovery-confirm-reset"
        >
          <Text style={styles.secondaryLinkText}>복구 단계 처음부터 다시 시작</Text>
        </Pressable>
      </View>
    </AuthScaffold>
  );
};

const panelStyles = StyleSheet.create({
  card: {
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: '#FFF9F4',
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: palette.ink,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
    color: palette.inkSoft,
  },
  codeBlock: {
    borderRadius: 14,
    backgroundColor: '#FFF2E6',
    borderWidth: 1,
    borderColor: '#F6D5BA',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  manualKey: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: palette.accentDeep,
  },
});
