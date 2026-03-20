import { Pressable, Text, View } from 'react-native';

import type { PasswordResetRequest } from '../../types/auth';
import type { PasswordResetResult } from '../../types/auth-ui';
import { useResetPasswordViewModel } from '../../auth/use-reset-password-view-model';
import { AuthField } from '../../components/auth/AuthField';
import { AuthScaffold } from '../../components/auth/AuthScaffold';
import { shouldUseQaPlaintextPasswords } from '../../config/runtime-options';
import { authSharedStyles as styles } from '../../components/auth/auth-styles';

interface ResetPasswordScreenProps {
  initialToken?: string;
  onForgotPasswordPress: () => void;
  onLoginPress: () => void;
  onSubmit: (payload: PasswordResetRequest) => Promise<PasswordResetResult>;
}

export const ResetPasswordScreen = ({
  initialToken,
  onForgotPasswordPress,
  onLoginPress,
  onSubmit,
}: ResetPasswordScreenProps) => {
  const viewModel = useResetPasswordViewModel({
    initialToken,
    submit: onSubmit,
  });
  const qaPlaintextPasswords = shouldUseQaPlaintextPasswords();

  return (
    <AuthScaffold
      mode="login"
      onLoginPress={onLoginPress}
      onRegisterPress={onForgotPasswordPress}
      showModeToggle={false}
      subtitle="메일이나 handoff로 전달된 재설정 토큰을 입력한 뒤 새 비밀번호를 설정해 주세요."
      title="새 비밀번호 설정"
    >
      <AuthField
        errorMessage={viewModel.feedback.fieldMessages.token}
        label="재설정 토큰"
        onChangeText={viewModel.updateToken}
        placeholder="재설정 토큰"
        supportMessage="메일이나 앱 handoff로 전달된 토큰을 그대로 입력해 주세요."
        testID="reset-password-token"
        value={viewModel.token}
      />
      <AuthField
        autoCapitalize="none"
        autoComplete={qaPlaintextPasswords ? 'off' : 'password-new'}
        errorMessage={viewModel.feedback.fieldMessages.newPassword}
        label="새 비밀번호"
        onChangeText={viewModel.updateNewPassword}
        onRightActionPress={qaPlaintextPasswords ? undefined : viewModel.togglePasswordVisibility}
        placeholder="새 비밀번호"
        rightActionActive={qaPlaintextPasswords || viewModel.showPassword}
        rightActionVariant="visibility"
        secureTextEntry={!qaPlaintextPasswords && !viewModel.showPassword}
        supportMessage={viewModel.passwordState.message}
        supportTone={
          viewModel.feedback.fieldErrors.newPassword
            ? 'error'
            : viewModel.passwordState.tone
        }
        testID="reset-password-new-password"
        textContentType={qaPlaintextPasswords ? 'none' : 'newPassword'}
        value={viewModel.newPassword}
      />
      {viewModel.feedback.globalMessage ? (
        <View style={[styles.banner, styles.bannerError]}>
          <Text style={[styles.bannerLabel, styles.bannerLabelError]}>확인 필요</Text>
          <Text style={styles.bannerMessage}>{viewModel.feedback.globalMessage}</Text>
        </View>
      ) : null}
      <Pressable
        disabled={viewModel.isSubmitting}
        onPress={() => {
          void viewModel.submitResetPassword();
        }}
        style={[
          styles.primaryButton,
          viewModel.isSubmitting ? styles.primaryButtonDisabled : null,
        ]}
        testID="reset-password-submit"
      >
        <Text style={styles.primaryButtonText}>
          {viewModel.isSubmitting ? '변경 중...' : '새 비밀번호 저장'}
        </Text>
      </Pressable>
      <View style={styles.secondaryLinkWrap}>
        <Pressable
          onPress={onForgotPasswordPress}
          style={styles.secondaryLinkButton}
        >
          <Text style={styles.secondaryLinkText}>비밀번호 재설정 다시 요청</Text>
        </Pressable>
      </View>
    </AuthScaffold>
  );
};
