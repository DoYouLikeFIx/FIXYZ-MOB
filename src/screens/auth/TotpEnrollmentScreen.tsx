import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTotpEnrollmentViewModel } from '../../auth/use-totp-enrollment-view-model';
import { useExpiryCountdown } from '../../auth/use-expiry-countdown';
import { AuthField } from '../../components/auth/AuthField';
import { AuthScaffold } from '../../components/auth/AuthScaffold';
import type {
  LoginChallenge,
  TotpEnrollmentConfirmationRequest,
} from '../../types/auth';
import type {
  FormSubmissionResult,
  TotpEnrollmentBootstrapResult,
} from '../../types/auth-ui';
import { authSharedStyles as styles, palette } from '../../components/auth/auth-styles';

interface TotpEnrollmentScreenProps {
  bannerMessage?: string | null;
  bannerTone?: 'info' | 'error' | 'success';
  challenge: LoginChallenge;
  onLoadEnrollment: () => Promise<TotpEnrollmentBootstrapResult>;
  onLoginPress: () => void;
  onRegisterPress: () => void;
  onRestartLogin: () => void;
  onSubmit: (
    payload: TotpEnrollmentConfirmationRequest,
  ) => Promise<FormSubmissionResult>;
}

export const TotpEnrollmentScreen = ({
  bannerMessage,
  bannerTone,
  challenge,
  onLoadEnrollment,
  onLoginPress,
  onRegisterPress,
  onRestartLogin,
  onSubmit,
}: TotpEnrollmentScreenProps) => {
  const viewModel = useTotpEnrollmentViewModel({
    challenge,
    loadEnrollment: onLoadEnrollment,
    submit: onSubmit,
  });
  const countdown = useExpiryCountdown(
    viewModel.bootstrap?.expiresAt ?? challenge.expiresAt,
  );

  return (
    <AuthScaffold
      bannerMessage={bannerMessage}
      bannerTone={bannerTone}
      mode="login"
      onLoginPress={onLoginPress}
      onRegisterPress={onRegisterPress}
      showModeToggle={false}
      subtitle="처음 로그인하는 계정은 Google Authenticator 연결을 먼저 완료해야 합니다."
      title="Google Authenticator를 연결해 주세요"
    >
      {viewModel.isLoadingBootstrap ? (
        <View style={styles.inlineInfoCard} testID="totp-enroll-loading">
          <Text style={styles.inlineInfoTitle}>등록 정보를 준비하고 있습니다.</Text>
          <Text style={styles.inlineInfoBody}>
            보안 키와 QR 등록 URI를 불러오는 중입니다.
          </Text>
        </View>
      ) : null}
      {!viewModel.bootstrap && viewModel.errorMessage ? (
        <View style={styles.secondaryLinkWrap}>
          <Pressable
            onPress={() => {
              viewModel.retryBootstrap();
            }}
            style={styles.secondaryLinkButton}
            testID="totp-enroll-retry"
          >
            <Text style={styles.secondaryLinkText}>등록 정보 다시 불러오기</Text>
          </Pressable>
        </View>
      ) : null}
      {viewModel.bootstrap ? (
        <>
          <View style={panelStyles.card}>
            <Text style={panelStyles.title}>QR 등록 안내</Text>
            <Text style={panelStyles.body}>
              Google Authenticator 앱이 같은 기기에 설치되어 있다면 아래 버튼으로 바로 열 수 있습니다.
            </Text>
            <Pressable
              onPress={() => {
                void viewModel.openAuthenticator();
              }}
              style={styles.secondaryLinkButton}
              testID="totp-enroll-open-authenticator"
            >
              <Text style={styles.secondaryLinkText}>Google Authenticator 열기</Text>
            </Pressable>
            <Text style={styles.inlineInfoDetail}>
              앱이 열리지 않으면 아래 수동 입력 키를 사용해 직접 등록해 주세요.
            </Text>
          </View>
          <View style={panelStyles.card}>
            <Text style={panelStyles.title}>수동 입력 키</Text>
            <Text style={panelStyles.body}>
              QR 스캔이 어렵다면 아래 키를 앱에 직접 입력해도 됩니다.
            </Text>
            <View style={panelStyles.codeBlock}>
              <Text selectable style={panelStyles.manualKey} testID="totp-enroll-manual-key">
                {viewModel.bootstrap.manualEntryKey}
              </Text>
            </View>
            <Text style={styles.inlineInfoDetail} testID="totp-enroll-expiry">
              등록 만료: {countdown.expiresAtLabel} · {countdown.remainingLabel}
            </Text>
          </View>
        </>
      ) : null}
      <AuthField
        errorMessage={viewModel.errorMessage ?? undefined}
        keyboardType="numeric"
        label="첫 인증 코드"
        onChangeText={viewModel.updateOtpCode}
        placeholder="6자리 코드"
        supportMessage="앱에 계정이 추가되면 현재 표시된 첫 6자리 코드를 입력해 주세요."
        testID="totp-enroll-code"
        textContentType="oneTimeCode"
        value={viewModel.otpCode}
      />
      <Pressable
        disabled={viewModel.isSubmitting || viewModel.isLoadingBootstrap || !viewModel.bootstrap}
        onPress={() => {
          void viewModel.submitEnrollment();
        }}
        style={[
          styles.primaryButton,
          viewModel.isSubmitting || viewModel.isLoadingBootstrap || !viewModel.bootstrap
            ? styles.primaryButtonDisabled
            : null,
        ]}
        testID="totp-enroll-submit"
      >
        <Text style={styles.primaryButtonText}>
          {viewModel.isSubmitting ? '등록 확인 중...' : '등록 완료'}
        </Text>
      </Pressable>
      <View style={styles.secondaryLinkWrap}>
        <Pressable
          onPress={onRestartLogin}
          style={styles.secondaryLinkButton}
          testID="totp-enroll-reset"
        >
          <Text style={styles.secondaryLinkText}>로그인 처음부터 다시 시작</Text>
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
  codeValue: {
    fontSize: 12,
    lineHeight: 18,
    color: palette.ink,
  },
  manualKey: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: palette.accentDeep,
  },
});
