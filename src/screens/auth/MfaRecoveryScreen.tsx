import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { resolveMfaErrorPresentation } from '../../auth/auth-errors';
import type { MfaRecoveryState } from '../../auth/auth-flow-view-model';
import { AuthField } from '../../components/auth/AuthField';
import { AuthScaffold } from '../../components/auth/AuthScaffold';
import { authSharedStyles as styles, palette } from '../../components/auth/auth-styles';
import type { AuthStatus } from '../../store/auth-store';
import type { Member, MemberTotpRebindRequest } from '../../types/auth';
import type { TotpRebindBootstrapResult } from '../../types/auth-ui';

interface MfaRecoveryScreenProps {
  authStatus: AuthStatus;
  member: Member | null;
  mfaRecovery: MfaRecoveryState | null;
  onBootstrapAuthenticated: (
    payload: MemberTotpRebindRequest,
  ) => Promise<TotpRebindBootstrapResult>;
  onBootstrapRecovery: () => Promise<TotpRebindBootstrapResult>;
  onRestartRecovery: () => void;
  onForgotPasswordPress: () => void;
  onLoginPress: () => void;
  onRegisterPress: () => void;
}

export const MfaRecoveryScreen = ({
  authStatus,
  member,
  mfaRecovery,
  onBootstrapAuthenticated,
  onBootstrapRecovery,
  onRestartRecovery,
  onForgotPasswordPress,
  onLoginPress,
  onRegisterPress,
}: MfaRecoveryScreenProps) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAttemptedProofBootstrap, setHasAttemptedProofBootstrap] = useState(false);
  const proofBootstrapRequestIdRef = useRef(0);
  const suggestedEmail = mfaRecovery?.suggestedEmail?.trim() ?? '';
  const hasRecoveryProof = Boolean(mfaRecovery?.recoveryProof);
  const isAuthenticatedEntry = authStatus === 'authenticated' && Boolean(member);

  useEffect(() => () => {
    proofBootstrapRequestIdRef.current += 1;
  }, []);

  useEffect(() => {
    setHasAttemptedProofBootstrap(false);
    if (mfaRecovery?.recoveryProof) {
      setErrorMessage(null);
    }
  }, [mfaRecovery?.recoveryProof]);

  useEffect(() => {
    if (!hasRecoveryProof || isAuthenticatedEntry || mfaRecovery?.bootstrap || isSubmitting || hasAttemptedProofBootstrap) {
      return;
    }

    const requestId = proofBootstrapRequestIdRef.current + 1;
    proofBootstrapRequestIdRef.current = requestId;
    setHasAttemptedProofBootstrap(true);
    setIsSubmitting(true);
    setErrorMessage(null);

    void onBootstrapRecovery()
      .then((result) => {
        if (proofBootstrapRequestIdRef.current !== requestId || result.success) {
          return;
        }

        const presentation = resolveMfaErrorPresentation(result.error);

        if (presentation.code === 'AUTH-019' || presentation.code === 'AUTH-020') {
          onRestartRecovery();
        }

        setErrorMessage(presentation.message);
      })
      .catch((error) => {
        if (proofBootstrapRequestIdRef.current !== requestId) {
          return;
        }

        const presentation = resolveMfaErrorPresentation(error);

        if (presentation.code === 'AUTH-019' || presentation.code === 'AUTH-020') {
          onRestartRecovery();
        }

        setErrorMessage(presentation.message);
      })
      .finally(() => {
        if (proofBootstrapRequestIdRef.current === requestId) {
          setIsSubmitting(false);
        }
      });
  }, [
    hasAttemptedProofBootstrap,
    hasRecoveryProof,
    isAuthenticatedEntry,
    isSubmitting,
    mfaRecovery?.bootstrap,
    onBootstrapRecovery,
    onRestartRecovery,
  ]);

  const handleAuthenticatedSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await onBootstrapAuthenticated({
        currentPassword,
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

  const shouldShowPasswordEntry = isAuthenticatedEntry && !hasRecoveryProof;

  return (
    <AuthScaffold
      mode="login"
      onLoginPress={onLoginPress}
      onRegisterPress={onRegisterPress}
      showModeToggle={!isAuthenticatedEntry}
      subtitle="기존 authenticator를 더 이상 사용할 수 없을 때, 비밀번호 재설정이나 현재 세션 확인으로 새 기기 등록을 이어갑니다."
      title="MFA 복구 시작"
    >
      <View style={panelStyles.card} testID="mfa-recovery-entry">
        <Text style={panelStyles.title}>MFA 복구 안내</Text>
        {hasRecoveryProof ? (
          <>
            <Text style={panelStyles.body}>
              비밀번호 재설정이 완료되어 새 authenticator 등록을 준비하고 있습니다.
            </Text>
            <Text style={styles.inlineInfoDetail}>
              잠시 후 자동으로 다음 단계로 이동합니다.
            </Text>
          </>
        ) : shouldShowPasswordEntry ? (
          <>
            <Text style={panelStyles.body}>
              현재 로그인된 세션을 확인한 뒤 기존 authenticator를 새 기기로 교체합니다.
            </Text>
            <Text style={styles.inlineInfoDetail}>
              현재 비밀번호를 다시 입력하면 새 authenticator 등록 단계가 시작됩니다.
            </Text>
          </>
        ) : (
          <>
            <Text style={panelStyles.body}>
              기존 authenticator를 사용할 수 없으면 비밀번호 재설정을 먼저 완료한 뒤 복구를 이어가야 합니다.
            </Text>
            <Text style={styles.inlineInfoDetail}>
              {suggestedEmail
                ? `입력했던 이메일(${suggestedEmail})로 비밀번호 재설정을 진행하면 다음 단계로 바로 이어집니다.`
                : '비밀번호 재설정을 완료하면 이 화면에서 새 authenticator 등록으로 이어집니다.'}
            </Text>
          </>
        )}
      </View>

      {shouldShowPasswordEntry ? (
        <AuthField
          autoCapitalize="none"
          autoComplete="password"
          errorMessage={undefined}
          label="현재 비밀번호"
          onChangeText={(value) => {
            setCurrentPassword(value);
            setErrorMessage(null);
          }}
          placeholder="현재 비밀번호"
          secureTextEntry
          supportMessage="확인이 완료되면 이전 authenticator는 비활성화되고 새 등록 단계가 시작됩니다."
          testID="mfa-recovery-current-password"
          textContentType="password"
          value={currentPassword}
        />
      ) : null}

      {errorMessage ? (
        <View style={[styles.banner, styles.bannerError]}>
          <Text style={[styles.bannerLabel, styles.bannerLabelError]}>확인 필요</Text>
          <Text style={styles.bannerMessage} testID="mfa-recovery-error">{errorMessage}</Text>
        </View>
      ) : null}

      {shouldShowPasswordEntry ? (
        <Pressable
          disabled={isSubmitting}
          onPress={() => {
            void handleAuthenticatedSubmit();
          }}
          style={[
            styles.primaryButton,
            isSubmitting ? styles.primaryButtonDisabled : null,
          ]}
          testID="mfa-recovery-submit"
        >
          <Text style={styles.primaryButtonText}>
            {isSubmitting ? '복구 준비 중...' : '새 authenticator 등록 시작'}
          </Text>
        </Pressable>
      ) : hasRecoveryProof ? (
        <Pressable
          disabled={isSubmitting}
          onPress={() => {
            setHasAttemptedProofBootstrap(false);
            setErrorMessage(null);
          }}
          style={[
            styles.secondaryLinkButton,
            isSubmitting ? styles.primaryButtonDisabled : null,
          ]}
          testID="mfa-recovery-retry"
        >
          <Text style={styles.secondaryLinkText}>
            {isSubmitting ? '복구 준비 중...' : '복구 단계 다시 시도'}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.secondaryLinkWrap}>
          <Pressable
            onPress={onForgotPasswordPress}
            style={styles.secondaryLinkButton}
            testID="mfa-recovery-open-forgot-password"
          >
            <Text style={styles.secondaryLinkText}>비밀번호 재설정으로 이동</Text>
          </Pressable>
        </View>
      )}
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
});
