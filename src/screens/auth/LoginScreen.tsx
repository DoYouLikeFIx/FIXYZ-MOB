import { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import type { LoginRequest } from '../../types/auth';
import type { FormSubmissionResult } from '../../types/auth-ui';
import { buildPasswordRecoveryGuidance } from '../../auth/auth-copy';
import { useLoginViewModel } from '../../auth/use-login-view-model';
import { AuthField } from '../../components/auth/AuthField';
import { AuthScaffold } from '../../components/auth/AuthScaffold';
import { authSharedStyles as styles } from '../../components/auth/auth-styles';
import { shouldUseQaPlaintextPasswords } from '../../config/runtime-options';

interface LoginScreenProps {
  bannerMessage?: string | null;
  bannerTone?: 'info' | 'error' | 'success';
  onForgotPasswordPress: () => void;
  onSubmit: (payload: LoginRequest) => Promise<FormSubmissionResult>;
  onRegisterPress: () => void;
  onLoginPress: () => void;
}

export const LoginScreen = ({
  bannerMessage,
  bannerTone,
  onForgotPasswordPress,
  onSubmit,
  onRegisterPress,
  onLoginPress,
}: LoginScreenProps) => {
  const passwordInputRef = useRef<TextInput | null>(null);
  const [showPasswordRecoveryHelp, setShowPasswordRecoveryHelp] = useState(false);
  const viewModel = useLoginViewModel({
    submit: onSubmit,
  });
  const qaPlaintextPasswords = shouldUseQaPlaintextPasswords();
  const passwordRecoveryGuidance = buildPasswordRecoveryGuidance(viewModel.email);

  return (
    <AuthScaffold
      bannerMessage={bannerMessage}
      bannerTone={bannerTone}
      mode="login"
      onLoginPress={onLoginPress}
      onRegisterPress={onRegisterPress}
      showModeToggle={false}
      subtitle=""
      title="FIX 모바일 인증을 시작하세요"
    >
      <AuthField
        autoCapitalize="none"
        blurOnSubmit={false}
        errorMessage={viewModel.feedback.fieldMessages.email}
        label="이메일"
        onChangeText={viewModel.updateEmail}
        onSubmitEditing={() => {
          passwordInputRef.current?.focus();
        }}
        placeholder="이메일"
        returnKeyType="next"
        testID="login-email"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        supportMessage="로그인과 비밀번호 재설정에 같은 이메일을 사용합니다."
        value={viewModel.email}
      />
      <AuthField
        autoCapitalize="none"
        blurOnSubmit={false}
        errorMessage={viewModel.feedback.fieldMessages.password}
        label="비밀번호"
        onChangeText={viewModel.updatePassword}
        onRightActionPress={viewModel.togglePasswordVisibility}
        onSubmitEditing={() => {
          void viewModel.submitLogin();
        }}
        placeholder="비밀번호"
        ref={passwordInputRef}
        returnKeyType="done"
        rightActionActive={qaPlaintextPasswords || viewModel.showPassword}
        rightActionVariant="visibility"
        secureTextEntry={!qaPlaintextPasswords && !viewModel.showPassword}
        testID="login-password"
        autoComplete={qaPlaintextPasswords ? 'off' : 'password'}
        textContentType={qaPlaintextPasswords ? 'none' : 'password'}
        value={viewModel.password}
      />
      {viewModel.feedback.globalMessage ? (
        <View style={[styles.banner, styles.bannerError]}>
          <Text style={[styles.bannerLabel, styles.bannerLabelError]}>로그인 오류</Text>
          <Text style={styles.bannerMessage}>{viewModel.feedback.globalMessage}</Text>
        </View>
      ) : null}
      <View style={styles.inlineInfoActions}>
        <Pressable
          accessibilityRole="button"
          onPress={onForgotPasswordPress}
          style={styles.inlineInfoTrigger}
          testID="login-open-password-recovery"
        >
          <Text style={styles.inlineInfoTriggerText}>
            비밀번호 재설정 요청
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setShowPasswordRecoveryHelp((current) => !current);
          }}
          style={styles.inlineInfoTrigger}
          testID="login-password-recovery-toggle"
        >
          <Text style={styles.inlineInfoTriggerText}>
            {showPasswordRecoveryHelp ? '안내 닫기' : '비밀번호 재설정 안내'}
          </Text>
        </Pressable>
      </View>
      {showPasswordRecoveryHelp ? (
        <View style={styles.inlineInfoCard} testID="login-password-recovery-help">
          <Text style={styles.inlineInfoTitle}>{passwordRecoveryGuidance.title}</Text>
          <Text style={styles.inlineInfoBody}>{passwordRecoveryGuidance.body}</Text>
          <Text style={styles.inlineInfoDetail}>{passwordRecoveryGuidance.detail}</Text>
        </View>
      ) : null}
      <Pressable
        disabled={viewModel.isSubmitting}
        onPress={() => {
          void viewModel.submitLogin();
        }}
        style={[
          styles.primaryButton,
          viewModel.isSubmitting ? styles.primaryButtonDisabled : null,
        ]}
        testID="login-submit"
      >
        <Text style={styles.primaryButtonText}>
          {viewModel.isSubmitting ? '로그인 중...' : '로그인'}
        </Text>
      </Pressable>
      <View style={styles.secondaryLinkWrap}>
        <Pressable
          onPress={onRegisterPress}
          style={styles.secondaryLinkButton}
        >
          <Text style={styles.secondaryLinkText}>
            새 계정 만들기
          </Text>
        </Pressable>
      </View>
    </AuthScaffold>
  );
};
