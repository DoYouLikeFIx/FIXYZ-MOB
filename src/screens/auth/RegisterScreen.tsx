import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  type KeyboardEvent,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  getConfirmPasswordState,
  getPasswordPolicyState,
  getRegisterKeyboardMessage,
  validateRegisterField,
} from '../../auth/form-validation';
import {
  createEmptyRegisterFeedback,
  type RegisterField,
  type RegisterFormFeedback,
  type RegisterFormValues,
} from '../../types/auth-ui';
import { AuthField } from '../../components/auth/AuthField';
import { authSharedStyles as styles } from '../../components/auth/auth-styles';

interface RegisterScreenProps {
  onSubmit: (payload: RegisterFormValues) => Promise<{
    success: boolean;
    feedback: RegisterFormFeedback;
  }>;
  onRegisterPress: () => void;
  onLoginPress: () => void;
}

const REGISTER_STEP_ORDER: RegisterField[] = [
  'username',
  'email',
  'name',
  'password',
  'confirmPassword',
];

const STEP_COPY: Record<RegisterField, { title: string; description: string }> = {
  username: {
    title: '아이디를 입력해 주세요',
    description: '입력이 끝나면 다음 항목으로 바로 이어집니다.',
  },
  email: {
    title: '이메일을 입력해 주세요',
    description: '인증과 안내를 받을 주소입니다.',
  },
  name: {
    title: '이름을 입력해 주세요',
    description: '실명 기준으로 입력해 주세요.',
  },
  password: {
    title: '비밀번호를 설정해 주세요',
    description: '정책을 만족하면 바로 다음 항목으로 이동합니다.',
  },
  confirmPassword: {
    title: '비밀번호를 한 번 더 입력해 주세요',
    description: '마지막 Enter로 바로 회원가입을 완료합니다.',
  },
};

const FIELD_LABELS: Record<RegisterField, string> = {
  username: '아이디',
  email: '이메일',
  name: '이름',
  password: '비밀번호',
  confirmPassword: '비밀번호 확인',
};

const getFieldPreview = (
  field: RegisterField,
  values: RegisterFormValues,
): string => {
  switch (field) {
    case 'password':
    case 'confirmPassword':
      return values[field] ? '*'.repeat(Math.max(values[field].length, 8)) : '';
    case 'email':
      return values.email.trim();
    case 'name':
      return values.name.trim();
    case 'username':
      return values.username.trim();
    default:
      return '';
  }
};

const getFirstInvalidField = (
  feedback: RegisterFormFeedback,
): RegisterField | null => {
  for (const field of REGISTER_STEP_ORDER) {
    if (feedback.fieldErrors[field]) {
      return field;
    }
  }

  return null;
};

export const RegisterScreen = ({
  onSubmit,
  onLoginPress,
}: RegisterScreenProps) => {
  const [values, setValues] = useState<RegisterFormValues>({
    username: '',
    email: '',
    name: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [feedback, setFeedback] =
    useState<RegisterFormFeedback>(createEmptyRegisterFeedback);
  const fieldRefs = useRef<Partial<Record<RegisterField, TextInput | null>>>({});
  const summaryScrollRef = useRef<ScrollView | null>(null);
  const previousActiveStepRef = useRef(0);

  const activeField = REGISTER_STEP_ORDER[activeStepIndex];
  const completedFields = REGISTER_STEP_ORDER.slice(0, activeStepIndex);
  const stepCopy = STEP_COPY[activeField];
  const passwordPolicyState = getPasswordPolicyState(values.password);
  const confirmPasswordState = getConfirmPasswordState(values);
  const {
    message: keyboardStepMessage,
    tone: keyboardStepTone,
  } = getRegisterKeyboardMessage(
    activeField,
    values,
    feedback,
    stepCopy.description,
  );

  useEffect(() => {
    const currentField = REGISTER_STEP_ORDER[activeStepIndex];

    const timeout = setTimeout(() => {
      fieldRefs.current[currentField]?.focus();
    }, 140);

    return () => {
      clearTimeout(timeout);
    };
  }, [activeStepIndex]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const changeFrameEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : null;

    const handleKeyboardShow = (event: KeyboardEvent) => {
      setIsKeyboardVisible(true);
      setKeyboardInset(event.endCoordinates.height);
    };

    const handleKeyboardHide = () => {
      setIsKeyboardVisible(false);
      setKeyboardInset(0);
    };

    const showSubscription = Keyboard.addListener(showEvent, handleKeyboardShow);
    const hideSubscription = Keyboard.addListener(hideEvent, handleKeyboardHide);
    const frameSubscription = changeFrameEvent
      ? Keyboard.addListener(changeFrameEvent, handleKeyboardShow)
      : null;

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
      frameSubscription?.remove();
    };
  }, []);

  useEffect(() => {
    const shouldSnapToLatestSummary =
      isKeyboardVisible && activeStepIndex > previousActiveStepRef.current;

    previousActiveStepRef.current = activeStepIndex;

    if (!shouldSnapToLatestSummary) {
      return;
    }

    const timeout = setTimeout(() => {
      summaryScrollRef.current?.scrollToEnd({
        animated: false,
      });
    }, 80);

    return () => {
      clearTimeout(timeout);
    };
  }, [activeStepIndex, isKeyboardVisible]);

  const setFieldFeedback = (
    field: RegisterField,
    message?: string,
  ) => {
    setFeedback((current) => ({
      ...current,
      globalMessage: null,
      fieldErrors: {
        ...current.fieldErrors,
        [field]: Boolean(message),
      },
      fieldMessages: {
        ...current.fieldMessages,
        [field]: message,
      },
    }));
  };

  const clearField = (field: RegisterField) => {
    setFieldFeedback(field, undefined);
  };

  const updateValue = (
    field: RegisterField,
    value: string,
  ) => {
    clearField(field);

    setValues((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const validateStep = (field: RegisterField): boolean => {
    const message = validateRegisterField(field, values);

    if (message) {
      setFieldFeedback(field, message);
      return false;
    }

    clearField(field);

    return true;
  };

  const focusStep = (index: number) => {
    setActiveStepIndex(index);
  };

  const handleSubmit = async () => {
    const firstInvalidField = REGISTER_STEP_ORDER.find(
      (field) => !validateStep(field),
    );

    if (firstInvalidField) {
      focusStep(REGISTER_STEP_ORDER.indexOf(firstInvalidField));
      return;
    }

    const result = await onSubmit(values);
    setFeedback(result.feedback);

    if (!result.success) {
      const invalidField = getFirstInvalidField(result.feedback);

      if (invalidField) {
        focusStep(REGISTER_STEP_ORDER.indexOf(invalidField));
      }
    }
  };

  const advanceFromField = (field: RegisterField) => {
    if (!validateStep(field)) {
      return;
    }

    const currentIndex = REGISTER_STEP_ORDER.indexOf(field);
    const nextIndex = currentIndex + 1;

    if (nextIndex >= REGISTER_STEP_ORDER.length) {
      void handleSubmit();
      return;
    }

    focusStep(nextIndex);
  };

  const renderCompletedField = (field: RegisterField, index: number) => (
    <Pressable
      key={field}
      onPress={() => {
        setActiveStepIndex(index);
      }}
      style={styles.minimalStepSummary}
    >
      <View style={styles.minimalStepSummaryTextWrap}>
        <Text style={styles.minimalStepSummaryLabel}>
          {FIELD_LABELS[field]}
        </Text>
        <Text style={styles.minimalStepSummaryValue}>
          {getFieldPreview(field, values)}
        </Text>
      </View>
    </Pressable>
  );

  const commonCurrentFieldProps = {
    autoFocus: true,
    blurOnSubmit: false,
    onFocus: () => {
      setActiveStepIndex(activeStepIndex);
    },
    onSubmitEditing: () => {
      advanceFromField(activeField);
    },
    ref: (node: TextInput | null) => {
      fieldRefs.current[activeField] = node;
    },
    returnKeyType: (
      activeStepIndex === REGISTER_STEP_ORDER.length - 1 ? 'done' : 'next'
    ) as 'done' | 'next',
    variant: 'minimal' as const,
  };

  const renderCurrentField = () => {
    switch (activeField) {
      case 'username':
        return (
          <View style={styles.minimalStepCurrentField}>
            <AuthField
              {...commonCurrentFieldProps}
              autoCapitalize="none"
              errorMessage={feedback.fieldMessages.username}
              label={FIELD_LABELS.username}
              onChangeText={(value) => {
                updateValue(activeField, value);
              }}
              placeholder="사용할 아이디"
              testID="register-username"
              autoComplete="username-new"
              textContentType="username"
              value={values.username}
            />
          </View>
        );
      case 'email':
        return (
          <View style={styles.minimalStepCurrentField}>
            <AuthField
              {...commonCurrentFieldProps}
              autoCapitalize="none"
              autoComplete="email"
              errorMessage={feedback.fieldMessages.email}
              keyboardType="email-address"
              label={FIELD_LABELS.email}
              onChangeText={(value) => {
                updateValue(activeField, value);
              }}
              placeholder="example@fix.com"
              testID="register-email"
              textContentType="emailAddress"
              value={values.email}
            />
          </View>
        );
      case 'name':
        return (
          <View style={styles.minimalStepCurrentField}>
            <AuthField
              {...commonCurrentFieldProps}
              autoCapitalize="words"
              autoComplete="name"
              errorMessage={feedback.fieldMessages.name}
              label={FIELD_LABELS.name}
              onChangeText={(value) => {
                updateValue(activeField, value);
              }}
              placeholder="이름"
              testID="register-name"
              textContentType="name"
              value={values.name}
            />
          </View>
        );
      case 'password':
        return (
          <View style={styles.minimalStepCurrentField}>
            <AuthField
              {...commonCurrentFieldProps}
              autoCapitalize="none"
              errorMessage={feedback.fieldMessages.password}
              label={FIELD_LABELS.password}
              onChangeText={(value) => {
                updateValue(activeField, value);
              }}
              onRightActionPress={() => {
                setShowPassword((current) => !current);
              }}
              placeholder="비밀번호"
              rightActionActive={showPassword}
              rightActionVariant="visibility"
              secureTextEntry={!showPassword}
              hideMessage={isKeyboardVisible}
              supportMessage={passwordPolicyState.message}
              supportTone={passwordPolicyState.tone}
              testID="register-password"
              autoComplete="password-new"
              textContentType="newPassword"
              value={values.password}
            />
          </View>
        );
      case 'confirmPassword':
        return (
          <View style={styles.minimalStepCurrentField}>
            <AuthField
              {...commonCurrentFieldProps}
              autoCapitalize="none"
              errorMessage={feedback.fieldMessages.confirmPassword}
              label={FIELD_LABELS.confirmPassword}
              onChangeText={(value) => {
                updateValue(activeField, value);
              }}
              onRightActionPress={() => {
                setShowConfirmPassword((current) => !current);
              }}
              placeholder="비밀번호를 다시 입력"
              rightActionActive={showConfirmPassword}
              rightActionVariant="visibility"
              secureTextEntry={!showConfirmPassword}
              hideMessage={isKeyboardVisible}
              supportMessage={confirmPasswordState.message}
              supportTone={confirmPasswordState.tone}
              testID="register-password-confirm"
              autoComplete="password-new"
              textContentType="newPassword"
              value={values.confirmPassword}
            />
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View
        style={[
          styles.screenFrame,
          isKeyboardVisible ? { paddingBottom: 20 + keyboardInset } : null,
        ]}
      >
        <View style={styles.backgroundOrbPrimary} />
        <View style={styles.backgroundOrbSecondary} />
        <View style={styles.pageChrome}>
          <View style={styles.topBar}>
            <View style={styles.brandChip}>
              <View style={styles.brandMark}>
                <View style={styles.brandMarkInner} />
              </View>
              <Text style={styles.brandText}>FIX Mobile</Text>
            </View>
          </View>

          <View
            style={[
              styles.minimalRegisterLayout,
              isKeyboardVisible ? styles.minimalRegisterLayoutKeyboard : null,
            ]}
          >
            <View style={styles.minimalRegisterHeader}>
              <Text style={styles.minimalRegisterEyebrow}>Sign Up</Text>
              <Text style={styles.minimalRegisterTitle}>{stepCopy.title}</Text>
              <Text
                style={[
                  styles.minimalRegisterSubtitle,
                  isKeyboardVisible && keyboardStepTone === 'success'
                    ? styles.minimalRegisterSubtitleSuccess
                    : null,
                  isKeyboardVisible && keyboardStepTone === 'error'
                    ? styles.minimalRegisterSubtitleError
                    : null,
                ]}
              >
                {isKeyboardVisible ? keyboardStepMessage : stepCopy.description}
              </Text>
            </View>

            <View
              style={[
                styles.minimalRegisterStage,
                isKeyboardVisible ? styles.minimalRegisterStageKeyboard : null,
              ]}
            >
              {completedFields.length > 0 ? (
                <ScrollView
                  bounces={false}
                  contentContainerStyle={styles.minimalRegisterSummaryContent}
                  keyboardShouldPersistTaps="handled"
                  ref={summaryScrollRef}
                  showsVerticalScrollIndicator={false}
                  style={styles.minimalRegisterSummaryScroll}
                >
                  {completedFields.map(renderCompletedField)}
                </ScrollView>
              ) : null}

              <View style={styles.minimalRegisterCurrentSection}>
                {renderCurrentField()}

                {feedback.globalMessage ? (
                  <View style={styles.minimalInlineError}>
                    <Text style={styles.minimalInlineErrorText}>
                      {feedback.globalMessage}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.secondaryLinkWrap}>
              <Pressable
                onPress={onLoginPress}
                style={styles.secondaryLinkButton}
              >
                <Text style={styles.secondaryLinkText}>
                  이미 계정이 있으신가요? 로그인으로 돌아가기
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};
