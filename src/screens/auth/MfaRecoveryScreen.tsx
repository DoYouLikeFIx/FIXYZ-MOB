import { Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  MfaRecoveryState,
  RestartMfaRecoveryOptions,
} from '../../auth/auth-flow-view-model';
import { useMfaRecoveryViewModel } from '../../auth/use-mfa-recovery-view-model';
import { AuthField } from '../../components/auth/AuthField';
import { AuthScaffold } from '../../components/auth/AuthScaffold';
import type { AuthStatus } from '../../store/auth-store';
import type { Member, MemberTotpRebindRequest } from '../../types/auth';
import type { TotpRebindBootstrapResult } from '../../types/auth-ui';
import { authSharedStyles as styles, palette } from '../../components/auth/auth-styles';

interface MfaRecoveryScreenProps {
  authStatus: AuthStatus;
  bannerMessage?: string | null;
  bannerTone?: 'info' | 'error' | 'success';
  member: Member | null;
  mfaRecovery: MfaRecoveryState | null;
  onBootstrapAuthenticated: (
    payload: MemberTotpRebindRequest,
  ) => Promise<TotpRebindBootstrapResult>;
  onBootstrapRecovery: () => Promise<TotpRebindBootstrapResult>;
  onRestartRecovery: (options?: RestartMfaRecoveryOptions) => void;
  onRequireEnrollmentRestart: (message: string) => void;
  onForgotPasswordPress: () => void;
  onLoginPress: () => void;
  onRegisterPress: () => void;
}

export const MfaRecoveryScreen = ({
  authStatus,
  bannerMessage,
  bannerTone,
  member,
  mfaRecovery,
  onBootstrapAuthenticated,
  onBootstrapRecovery,
  onRestartRecovery,
  onRequireEnrollmentRestart,
  onForgotPasswordPress,
  onLoginPress,
  onRegisterPress,
}: MfaRecoveryScreenProps) => {
  const viewModel = useMfaRecoveryViewModel({
    authStatus,
    member,
    mfaRecovery,
    bootstrapAuthenticated: onBootstrapAuthenticated,
    bootstrapRecovery: onBootstrapRecovery,
    restartRecovery: onRestartRecovery,
    restartEnrollmentLogin: onRequireEnrollmentRestart,
  });

  return (
    <AuthScaffold
      bannerMessage={bannerMessage}
      bannerTone={bannerTone}
      mode="login"
      onLoginPress={onLoginPress}
      onRegisterPress={onRegisterPress}
      showModeToggle={!viewModel.isAuthenticatedEntry}
      subtitle="기존 authenticator를 더 이상 사용할 수 없을 때, 비밀번호 재설정이나 현재 세션 확인으로 새 기기 등록을 이어갑니다."
      title="MFA 복구 시작"
    >
      <View style={panelStyles.card} testID="mfa-recovery-entry">
        <Text style={panelStyles.title}>MFA 복구 안내</Text>
        {viewModel.hasRecoveryProof ? (
          <>
            <Text style={panelStyles.body}>
              비밀번호 재설정이 완료되어 새 authenticator 등록을 준비하고 있습니다.
            </Text>
            <Text style={styles.inlineInfoDetail}>
              잠시 후 자동으로 다음 단계로 이동합니다.
            </Text>
          </>
        ) : viewModel.shouldShowPasswordEntry ? (
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
              {viewModel.suggestedEmail
                ? `입력했던 이메일(${viewModel.suggestedEmail})로 비밀번호 재설정을 진행하면 다음 단계로 바로 이어집니다.`
                : '비밀번호 재설정을 완료하면 이 화면에서 새 authenticator 등록으로 이어집니다.'}
            </Text>
          </>
        )}
      </View>

      {viewModel.shouldShowPasswordEntry ? (
        <AuthField
          autoCapitalize="none"
          autoComplete="password"
          errorMessage={undefined}
          label="현재 비밀번호"
          onChangeText={viewModel.updateCurrentPassword}
          placeholder="현재 비밀번호"
          secureTextEntry
          supportMessage="확인이 완료되면 이전 authenticator는 비활성화되고 새 등록 단계가 시작됩니다."
          testID="mfa-recovery-current-password"
          textContentType="password"
          value={viewModel.currentPassword}
        />
      ) : null}

      {viewModel.errorMessage ? (
        <View style={[styles.banner, styles.bannerError]}>
          <Text style={[styles.bannerLabel, styles.bannerLabelError]}>확인 필요</Text>
          <Text style={styles.bannerMessage} testID="mfa-recovery-error">{viewModel.errorMessage}</Text>
        </View>
      ) : null}

      {viewModel.shouldShowPasswordEntry ? (
        <Pressable
          disabled={viewModel.isSubmitting}
          onPress={() => {
            void viewModel.submitAuthenticatedRecovery();
          }}
          style={[
            styles.primaryButton,
            viewModel.isSubmitting ? styles.primaryButtonDisabled : null,
          ]}
          testID="mfa-recovery-submit"
        >
          <Text style={styles.primaryButtonText}>
            {viewModel.isSubmitting ? '복구 준비 중...' : '새 authenticator 등록 시작'}
          </Text>
        </Pressable>
      ) : viewModel.hasRecoveryProof ? (
        <Pressable
          disabled={viewModel.isSubmitting}
          onPress={() => {
            viewModel.retryProofBootstrap();
          }}
          style={[
            styles.secondaryLinkButton,
            viewModel.isSubmitting ? styles.primaryButtonDisabled : null,
          ]}
          testID="mfa-recovery-retry"
        >
          <Text style={styles.secondaryLinkText}>
            {viewModel.isSubmitting ? '복구 준비 중...' : '복구 단계 다시 시도'}
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
