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
  type RegisterField,
} from '../../types/auth-ui';
import type { AuthMutationResult } from '../../auth/mobile-auth-service';
import type { RegisterRequest } from '../../types/auth';
import { REGISTER_EMAIL_USAGE_HINT } from '../../auth/auth-copy';
import {
  REGISTER_FIELD_LABELS,
  REGISTER_STEP_ORDER,
  getRegisterFieldPreview,
  useRegisterViewModel,
} from '../../auth/use-register-view-model';
import { AuthField } from '../../components/auth/AuthField';
import { authSharedStyles as styles } from '../../components/auth/auth-styles';

interface RegisterScreenProps {
  onSubmit: (payload: RegisterRequest) => Promise<AuthMutationResult>;
  onLoginPress: () => void;
}

export const RegisterScreen = ({
  onSubmit,
  onLoginPress,
}: RegisterScreenProps) => {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const fieldRefs = useRef<Partial<Record<RegisterField, TextInput | null>>>({});
  const summaryScrollRef = useRef<ScrollView | null>(null);
  const previousActiveStepRef = useRef(0);
  const viewModel = useRegisterViewModel({
    submit: onSubmit,
  });

  useEffect(() => {
    const currentField = REGISTER_STEP_ORDER[viewModel.activeStepIndex];

    const timeout = setTimeout(() => {
      fieldRefs.current[currentField]?.focus();
    }, 140);

    return () => {
      clearTimeout(timeout);
    };
  }, [viewModel.activeStepIndex]);

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
      isKeyboardVisible && viewModel.activeStepIndex > previousActiveStepRef.current;

    previousActiveStepRef.current = viewModel.activeStepIndex;

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
  }, [isKeyboardVisible, viewModel.activeStepIndex]);

  const renderCompletedField = (field: RegisterField, index: number) => (
    <Pressable
      key={field}
      onPress={() => {
        viewModel.focusStep(index);
      }}
      style={styles.minimalStepSummary}
    >
      <View style={styles.minimalStepSummaryTextWrap}>
        <Text style={styles.minimalStepSummaryLabel}>
          {REGISTER_FIELD_LABELS[field]}
        </Text>
        <Text style={styles.minimalStepSummaryValue}>
          {getRegisterFieldPreview(field, viewModel.values)}
        </Text>
      </View>
    </Pressable>
  );

  const commonCurrentFieldProps = {
    autoFocus: true,
    blurOnSubmit: false,
    onFocus: () => {
      viewModel.focusStep(viewModel.activeStepIndex);
    },
    onSubmitEditing: () => {
      viewModel.advanceFromField(viewModel.activeField);
    },
    ref: (node: TextInput | null) => {
      fieldRefs.current[viewModel.activeField] = node;
    },
    returnKeyType: (
      viewModel.activeStepIndex === REGISTER_STEP_ORDER.length - 1
        ? 'done'
        : 'next'
    ) as 'done' | 'next',
    variant: 'minimal' as const,
  };

  const renderCurrentField = () => {
    switch (viewModel.activeField) {
      case 'email':
        return (
          <View style={styles.minimalStepCurrentField}>
            <AuthField
              {...commonCurrentFieldProps}
              autoCapitalize="none"
              autoComplete="email"
              errorMessage={viewModel.feedback.fieldMessages.email}
              keyboardType="email-address"
              label={REGISTER_FIELD_LABELS.email}
              onChangeText={(value) => {
                viewModel.updateValue(viewModel.activeField, value);
              }}
              placeholder="example@fix.com"
              supportMessage={REGISTER_EMAIL_USAGE_HINT}
              testID="register-email"
              textContentType="emailAddress"
              value={viewModel.values.email}
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
              errorMessage={viewModel.feedback.fieldMessages.name}
              label={REGISTER_FIELD_LABELS.name}
              onChangeText={(value) => {
                viewModel.updateValue(viewModel.activeField, value);
              }}
              placeholder="이름"
              testID="register-name"
              textContentType="name"
              value={viewModel.values.name}
            />
          </View>
        );
      case 'password':
        return (
          <View style={styles.minimalStepCurrentField}>
            <AuthField
              {...commonCurrentFieldProps}
              autoCapitalize="none"
              errorMessage={viewModel.feedback.fieldMessages.password}
              label={REGISTER_FIELD_LABELS.password}
              onChangeText={(value) => {
                viewModel.updateValue(viewModel.activeField, value);
              }}
              onRightActionPress={viewModel.togglePasswordVisibility}
              placeholder="비밀번호"
              rightActionActive={viewModel.showPassword}
              rightActionVariant="visibility"
              secureTextEntry={!viewModel.showPassword}
              hideMessage={isKeyboardVisible}
              supportMessage={viewModel.passwordPolicyState.message}
              supportTone={viewModel.passwordPolicyState.tone}
              testID="register-password"
              autoComplete="password-new"
              textContentType="newPassword"
              value={viewModel.values.password}
            />
          </View>
        );
      case 'confirmPassword':
        return (
          <View style={styles.minimalStepCurrentField}>
            <AuthField
              {...commonCurrentFieldProps}
              autoCapitalize="none"
              errorMessage={viewModel.feedback.fieldMessages.confirmPassword}
              label={REGISTER_FIELD_LABELS.confirmPassword}
              onChangeText={(value) => {
                viewModel.updateValue(viewModel.activeField, value);
              }}
              onRightActionPress={viewModel.toggleConfirmPasswordVisibility}
              placeholder="비밀번호를 다시 입력"
              rightActionActive={viewModel.showConfirmPassword}
              rightActionVariant="visibility"
              secureTextEntry={!viewModel.showConfirmPassword}
              hideMessage={isKeyboardVisible}
              supportMessage={viewModel.confirmPasswordState.message}
              supportTone={viewModel.confirmPasswordState.tone}
              testID="register-password-confirm"
              autoComplete="password-new"
              textContentType="newPassword"
              value={viewModel.values.confirmPassword}
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
              <Text style={styles.minimalRegisterTitle}>{viewModel.stepCopy.title}</Text>
              <Text
                style={[
                  styles.minimalRegisterSubtitle,
                  isKeyboardVisible && viewModel.keyboardStepTone === 'success'
                    ? styles.minimalRegisterSubtitleSuccess
                    : null,
                  isKeyboardVisible && viewModel.keyboardStepTone === 'error'
                    ? styles.minimalRegisterSubtitleError
                    : null,
                ]}
              >
                {isKeyboardVisible
                  ? viewModel.keyboardStepMessage
                  : viewModel.stepCopy.description}
              </Text>
            </View>

            <View
              style={[
                styles.minimalRegisterStage,
                isKeyboardVisible ? styles.minimalRegisterStageKeyboard : null,
              ]}
            >
              {viewModel.completedFields.length > 0 ? (
                <ScrollView
                  bounces={false}
                  contentContainerStyle={styles.minimalRegisterSummaryContent}
                  keyboardShouldPersistTaps="handled"
                  ref={summaryScrollRef}
                  showsVerticalScrollIndicator={false}
                  style={styles.minimalRegisterSummaryScroll}
                >
                  {viewModel.completedFields.map(renderCompletedField)}
                </ScrollView>
              ) : null}

              <View style={styles.minimalRegisterCurrentSection}>
                {renderCurrentField()}

                {viewModel.feedback.globalMessage ? (
                  <View style={styles.minimalInlineError}>
                    <Text style={styles.minimalInlineErrorText}>
                      {viewModel.feedback.globalMessage}
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
