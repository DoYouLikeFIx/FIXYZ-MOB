import { useRef } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import type { LoginRequest } from '../../types/auth';
import type { AuthMutationResult } from '../../auth/mobile-auth-service';
import { useLoginViewModel } from '../../auth/use-login-view-model';
import { AuthField } from '../../components/auth/AuthField';
import { AuthScaffold } from '../../components/auth/AuthScaffold';
import { authSharedStyles as styles } from '../../components/auth/auth-styles';

interface LoginScreenProps {
  bannerMessage?: string | null;
  bannerTone?: 'info' | 'error';
  onSubmit: (payload: LoginRequest) => Promise<AuthMutationResult>;
  onRegisterPress: () => void;
  onLoginPress: () => void;
}

export const LoginScreen = ({
  bannerMessage,
  bannerTone,
  onSubmit,
  onRegisterPress,
  onLoginPress,
}: LoginScreenProps) => {
  const passwordInputRef = useRef<TextInput | null>(null);
  const viewModel = useLoginViewModel({
    submit: onSubmit,
  });

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
        errorMessage={viewModel.feedback.fieldMessages.username}
        label="아이디"
        onChangeText={viewModel.updateUsername}
        onSubmitEditing={() => {
          passwordInputRef.current?.focus();
        }}
        placeholder="아이디"
        returnKeyType="next"
        testID="login-username"
        autoComplete="username"
        textContentType="username"
        value={viewModel.username}
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
        rightActionActive={viewModel.showPassword}
        rightActionVariant="visibility"
        secureTextEntry={!viewModel.showPassword}
        testID="login-password"
        autoComplete="password"
        textContentType="password"
        value={viewModel.password}
      />
      {viewModel.feedback.globalMessage ? (
        <View style={[styles.banner, styles.bannerError]}>
          <Text style={[styles.bannerLabel, styles.bannerLabelError]}>로그인 오류</Text>
          <Text style={styles.bannerMessage}>{viewModel.feedback.globalMessage}</Text>
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
