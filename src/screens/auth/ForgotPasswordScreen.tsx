import { Pressable, Text, View } from 'react-native';

import type {
  PasswordForgotRequest,
  PasswordRecoveryChallengeRequest,
} from '../../types/auth';
import type {
  PasswordForgotResult,
  PasswordRecoveryChallengeResult,
} from '../../types/auth-ui';
import { isPasswordRecoveryProofOfWorkChallenge } from '../../auth/recovery-challenge';
import { useForgotPasswordViewModel } from '../../auth/use-forgot-password-view-model';
import { AuthField } from '../../components/auth/AuthField';
import { AuthScaffold } from '../../components/auth/AuthScaffold';
import { authSharedStyles as styles } from '../../components/auth/auth-styles';

interface ForgotPasswordScreenProps {
  onLoginPress: () => void;
  onRegisterPress: () => void;
  onResetPasswordPress: () => void;
  onSubmit: (payload: PasswordForgotRequest) => Promise<PasswordForgotResult>;
  onSubmitChallenge: (
    payload: PasswordRecoveryChallengeRequest,
  ) => Promise<PasswordRecoveryChallengeResult>;
}

export const ForgotPasswordScreen = ({
  onLoginPress,
  onRegisterPress,
  onResetPasswordPress,
  onSubmit,
  onSubmitChallenge,
}: ForgotPasswordScreenProps) => {
  const viewModel = useForgotPasswordViewModel({
    submit: onSubmit,
    submitChallenge: onSubmitChallenge,
  });

  const proofOfWorkChallenge = isPasswordRecoveryProofOfWorkChallenge(viewModel.challengeState)
    ? viewModel.challengeState
    : null;
  const legacyChallenge =
    viewModel.challengeState && proofOfWorkChallenge === null
      ? viewModel.challengeState
      : null;
  const isChallengeSubmissionBlocked =
    proofOfWorkChallenge !== null && viewModel.challengeSolveStatus !== 'solved';

  return (
    <AuthScaffold
      mode="login"
      onLoginPress={onLoginPress}
      onRegisterPress={onRegisterPress}
      showModeToggle={false}
      subtitle="계정 존재 여부와 관계없이 동일한 안내를 제공합니다."
      title="비밀번호 재설정 요청"
    >
      <AuthField
        autoCapitalize="none"
        autoComplete="email"
        errorMessage={viewModel.feedback.fieldMessages.email}
        keyboardType="email-address"
        label="이메일"
        onChangeText={viewModel.updateEmail}
        placeholder="가입한 이메일"
        supportMessage="가입한 이메일을 입력하면 재설정 메일 발송 여부와 무관하게 동일한 안내가 표시됩니다."
        testID="forgot-password-email"
        textContentType="emailAddress"
        value={viewModel.email}
      />
      {viewModel.acceptedMessage ? (
        <View style={styles.inlineInfoCard} testID="forgot-password-accepted">
          <Text style={styles.inlineInfoTitle}>요청이 접수되었습니다.</Text>
          <Text style={styles.inlineInfoBody}>{viewModel.acceptedMessage}</Text>
          <Text style={styles.inlineInfoDetail}>
            계정이 조건을 충족하면 재설정 메일이 발송됩니다.
          </Text>
        </View>
      ) : null}
      {viewModel.challengeMayBeRequired ? (
        <View style={styles.inlineInfoCard}>
          <Text style={styles.inlineInfoTitle}>추가 보안 확인</Text>
          <Text style={styles.inlineInfoBody}>
            필요 시 보안 확인 정보를 먼저 받아 같은 이메일로 다시 제출할 수 있습니다.
          </Text>
          <Pressable
            disabled={viewModel.isBootstrappingChallenge || viewModel.isSubmitting}
            onPress={() => {
              void viewModel.bootstrapChallenge();
            }}
            style={[
              styles.secondaryLinkButton,
              viewModel.isBootstrappingChallenge || viewModel.isSubmitting
                ? styles.primaryButtonDisabled
                : null,
            ]}
            testID="forgot-password-bootstrap-challenge"
          >
            <Text style={styles.secondaryLinkText}>
              {viewModel.isBootstrappingChallenge ? '보안 확인 준비 중...' : '보안 확인 준비'}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {viewModel.challengeState ? (
        <View style={styles.inlineInfoCard} testID="forgot-password-challenge-state">
          <Text style={styles.inlineInfoTitle}>보안 확인 정보가 준비되었습니다.</Text>
          {proofOfWorkChallenge ? (
            <>
              <Text style={styles.inlineInfoBody}>
                유형: {proofOfWorkChallenge.challengeType}
              </Text>
              <Text style={styles.inlineInfoDetail}>
                챌린지 ID: {proofOfWorkChallenge.challengeId}
              </Text>
              <Text style={styles.inlineInfoDetail}>
                난이도: {proofOfWorkChallenge.challengePayload.proofOfWork.difficultyBits} bits
              </Text>
              <Text style={styles.inlineInfoDetail}>
                진행률: {viewModel.challengeSolveProgress}%
              </Text>
              <Text style={styles.inlineInfoDetail}>
                상태:{' '}
                {viewModel.challengeSolveStatus === 'solved'
                  ? '계산 완료'
                  : viewModel.challengeSolveStatus === 'failed'
                    ? '다시 불러와야 합니다'
                    : '계산 중'}
              </Text>
              <Pressable
                disabled={viewModel.isSubmitting || viewModel.isBootstrappingChallenge}
                onPress={() => {
                  viewModel.cancelChallenge();
                }}
                style={[
                  styles.secondaryLinkButton,
                  viewModel.isSubmitting || viewModel.isBootstrappingChallenge
                    ? styles.primaryButtonDisabled
                    : null,
                ]}
                testID="forgot-password-cancel-challenge"
              >
                <Text style={styles.secondaryLinkText}>보안 확인 취소</Text>
              </Pressable>
            </>
          ) : legacyChallenge ? (
            <>
              <Text style={styles.inlineInfoBody}>
                유형: {legacyChallenge.challengeType}
              </Text>
              <Text style={styles.inlineInfoDetail}>
                유효 시간: {legacyChallenge.challengeTtlSeconds}초
              </Text>
            </>
          ) : null}
        </View>
      ) : null}
      {legacyChallenge ? (
        <AuthField
          errorMessage={viewModel.feedback.fieldMessages.challengeAnswer}
          label="보안 확인 응답"
          onChangeText={viewModel.updateChallengeAnswer}
          placeholder="보안 확인 응답"
          testID="forgot-password-challenge-answer"
          value={viewModel.challengeAnswer}
        />
      ) : null}
      {viewModel.feedback.globalMessage ? (
        <View style={[styles.banner, styles.bannerError]}>
          <Text style={[styles.bannerLabel, styles.bannerLabelError]}>확인 필요</Text>
          <Text style={styles.bannerMessage}>{viewModel.feedback.globalMessage}</Text>
        </View>
      ) : null}
      <Pressable
        disabled={
          viewModel.isSubmitting
          || viewModel.isBootstrappingChallenge
          || isChallengeSubmissionBlocked
        }
        onPress={() => {
          void viewModel.submitForgotPassword();
        }}
        style={[
          styles.primaryButton,
          viewModel.isSubmitting || viewModel.isBootstrappingChallenge || isChallengeSubmissionBlocked
            ? styles.primaryButtonDisabled
            : null,
        ]}
        testID="forgot-password-submit"
      >
        <Text style={styles.primaryButtonText}>
          {viewModel.isSubmitting
            ? '요청 중...'
            : viewModel.challengeState
              ? '보안 확인 포함 요청'
              : '재설정 메일 요청'}
        </Text>
      </Pressable>
      <View style={styles.secondaryLinkWrap}>
        <Pressable
          onPress={() => {
            onResetPasswordPress();
          }}
          style={styles.secondaryLinkButton}
          testID="forgot-password-open-reset"
        >
          <Text style={styles.secondaryLinkText}>재설정 토큰 입력으로 이동</Text>
        </Pressable>
      </View>
    </AuthScaffold>
  );
};
