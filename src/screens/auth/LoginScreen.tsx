import { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import type { LoginRequest } from '../../types/auth';
import {
  createEmptyLoginFeedback,
  type LoginFormFeedback,
} from '../../types/auth-ui';
import { AuthField } from '../../components/auth/AuthField';
import { AuthScaffold } from '../../components/auth/AuthScaffold';
import { authSharedStyles as styles } from '../../components/auth/auth-styles';

interface LoginScreenProps {
  bannerMessage?: string | null;
  bannerTone?: 'info' | 'error';
  onSubmit: (payload: LoginRequest) => Promise<{
    success: boolean;
    feedback: LoginFormFeedback;
  }>;
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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] =
    useState<LoginFormFeedback>(createEmptyLoginFeedback);

  const clearField = (field: keyof LoginFormFeedback['fieldErrors']) => {
    setFeedback((current) => ({
      ...current,
      globalMessage: null,
      fieldErrors: {
        ...current.fieldErrors,
        [field]: false,
      },
      fieldMessages: {
        ...current.fieldMessages,
        [field]: undefined,
      },
    }));
  };

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await onSubmit({
        username,
        password,
      });

      setFeedback(result.feedback);
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
      subtitle=""
      title="FIX 모바일 인증을 시작하세요"
    >
      <AuthField
        autoCapitalize="none"
        blurOnSubmit={false}
        errorMessage={feedback.fieldMessages.username}
        label="아이디"
        onChangeText={(value) => {
          clearField('username');
          setUsername(value);
        }}
        onSubmitEditing={() => {
          passwordInputRef.current?.focus();
        }}
        placeholder="아이디"
        returnKeyType="next"
        testID="login-username"
        autoComplete="username"
        textContentType="username"
        value={username}
      />
      <AuthField
        autoCapitalize="none"
        blurOnSubmit={false}
        errorMessage={feedback.fieldMessages.password}
        label="비밀번호"
        onChangeText={(value) => {
          clearField('password');
          setPassword(value);
        }}
        onRightActionPress={() => {
          setShowPassword((current) => !current);
        }}
        onSubmitEditing={() => {
          void handleSubmit();
        }}
        placeholder="비밀번호"
        ref={passwordInputRef}
        returnKeyType="done"
        rightActionActive={showPassword}
        rightActionVariant="visibility"
        secureTextEntry={!showPassword}
        testID="login-password"
        autoComplete="password"
        textContentType="password"
        value={password}
      />
      {feedback.globalMessage ? (
        <View style={[styles.banner, styles.bannerError]}>
          <Text style={[styles.bannerLabel, styles.bannerLabelError]}>로그인 오류</Text>
          <Text style={styles.bannerMessage}>{feedback.globalMessage}</Text>
        </View>
      ) : null}
      <Pressable
        disabled={isSubmitting}
        onPress={() => {
          void handleSubmit();
        }}
        style={[
          styles.primaryButton,
          isSubmitting ? styles.primaryButtonDisabled : null,
        ]}
        testID="login-submit"
      >
        <Text style={styles.primaryButtonText}>
          {isSubmitting ? '로그인 중...' : '로그인'}
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
