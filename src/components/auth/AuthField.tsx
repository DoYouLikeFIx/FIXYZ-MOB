import {
  forwardRef,
  useState,
  type ComponentProps,
} from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { authSharedStyles as styles } from './auth-styles';

type TextInputProps = ComponentProps<typeof TextInput>;

interface AuthFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  variant?: 'outlined' | 'minimal';
  secureTextEntry?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  returnKeyType?: TextInputProps['returnKeyType'];
  blurOnSubmit?: boolean;
  autoFocus?: boolean;
  errorMessage?: string;
  supportMessage?: string;
  hideMessage?: boolean;
  supportTone?: 'neutral' | 'success' | 'error';
  rightActionLabel?: string;
  rightActionVariant?: 'text' | 'visibility';
  rightActionActive?: boolean;
  onRightActionPress?: () => void;
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  onFocus?: TextInputProps['onFocus'];
  testID?: string;
}

export const AuthField = forwardRef<TextInput, AuthFieldProps>(({
  label,
  placeholder,
  value,
  onChangeText,
  variant = 'outlined',
  secureTextEntry = false,
  keyboardType,
  autoCapitalize = 'none',
  autoComplete,
  textContentType,
  returnKeyType,
  blurOnSubmit,
  autoFocus,
  errorMessage,
  supportMessage,
  hideMessage = false,
  supportTone = 'neutral',
  rightActionLabel,
  rightActionVariant = 'text',
  rightActionActive = false,
  onRightActionPress,
  onSubmitEditing,
  onFocus,
  testID,
}, ref) => {
  const [isFocused, setIsFocused] = useState(false);
  const toneStyle =
    errorMessage || supportTone === 'error'
      ? styles.fieldMessageError
      : supportTone === 'success'
        ? styles.fieldMessageSuccess
        : styles.fieldMessageNeutral;

  return (
    <View style={[styles.field, variant === 'minimal' ? styles.fieldMinimal : null]}>
      <Text
        style={[
          styles.fieldLabel,
          variant === 'minimal' ? styles.fieldLabelMinimal : null,
        ]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.inputShell,
          variant === 'minimal' ? styles.inputShellMinimal : null,
          isFocused ? styles.inputShellFocused : null,
          isFocused && variant === 'minimal' ? styles.inputShellFocusedMinimal : null,
          errorMessage ? styles.inputShellError : null,
          errorMessage && variant === 'minimal' ? styles.inputShellErrorMinimal : null,
        ]}
      >
        <TextInput
          autoCapitalize={autoCapitalize}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          blurOnSubmit={blurOnSubmit}
          keyboardType={keyboardType}
          onBlur={() => {
            setIsFocused(false);
          }}
          onChangeText={onChangeText}
          onFocus={(event) => {
            setIsFocused(true);
            onFocus?.(event);
          }}
          onSubmitEditing={onSubmitEditing}
          placeholder={placeholder}
          placeholderTextColor="#9AA4B2"
          ref={ref}
          returnKeyType={returnKeyType}
          secureTextEntry={secureTextEntry}
          style={[
            styles.textInput,
            variant === 'minimal' ? styles.textInputMinimal : null,
          ]}
          testID={testID}
          textContentType={textContentType}
          value={value}
        />
        {onRightActionPress ? (
          <Pressable
            accessibilityLabel={
              rightActionVariant === 'visibility'
                ? rightActionActive
                  ? '비밀번호 숨기기'
                  : '비밀번호 표시하기'
                : rightActionLabel
            }
            accessibilityRole="button"
            onPress={onRightActionPress}
            style={[
              styles.fieldAction,
              rightActionVariant === 'visibility' ? styles.fieldActionIconButton : null,
              variant === 'minimal' ? styles.fieldActionMinimal : null,
              variant === 'minimal' && rightActionVariant === 'visibility'
                ? styles.fieldActionIconButtonMinimal
                : null,
            ]}
          >
            {rightActionVariant === 'visibility' ? (
              <View
                style={[
                  styles.visibilityIcon,
                  variant === 'minimal' ? styles.visibilityIconMinimal : null,
                  rightActionActive ? styles.visibilityIconActive : null,
                ]}
              >
                <View style={styles.visibilityIconUpperArc} />
                <View style={styles.visibilityIconLowerArc} />
                <View style={styles.visibilityIconIris} />
                {!rightActionActive ? (
                  <View style={styles.visibilityIconSlash} />
                ) : null}
              </View>
            ) : (
              <Text
                style={[
                  styles.fieldActionText,
                  variant === 'minimal' ? styles.fieldActionTextMinimal : null,
                ]}
              >
                {rightActionLabel}
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>
      {!hideMessage && (errorMessage || supportMessage) ? (
        <Text
          style={[
            styles.fieldMessage,
            toneStyle,
            variant === 'minimal' ? styles.fieldMessageMinimal : null,
          ]}
        >
          {errorMessage ?? supportMessage}
        </Text>
      ) : null}
    </View>
  );
});

AuthField.displayName = 'AuthField';
