import type { ReactNode } from 'react';
import {
  Keyboard,
  type KeyboardEvent,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useEffect, useState } from 'react';

import { authSharedStyles as styles } from './auth-styles';

interface AuthScaffoldProps {
  mode: 'login' | 'register';
  title: string;
  subtitle: string;
  bannerMessage?: string | null;
  bannerTone?: 'info' | 'error' | 'success';
  showModeToggle?: boolean;
  onLoginPress: () => void;
  onRegisterPress: () => void;
  children: ReactNode;
}

const bannerToneLabel: Record<'info' | 'error' | 'success', string> = {
  info: '보안 알림',
  error: '확인 필요',
  success: '진행 완료',
};

export const AuthScaffold = ({
  mode,
  title,
  subtitle,
  bannerMessage,
  bannerTone = 'info',
  showModeToggle = true,
  onLoginPress,
  onRegisterPress,
  children,
}: AuthScaffoldProps) => {
  const { height } = useWindowDimensions();
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const isCompactHeight = height <= 880;
  const shouldCompact = isCompactHeight || isKeyboardVisible;
  const cardTopOffset = isKeyboardVisible
    ? 16
    : Math.min(Math.max(height * 0.11, 88), 124);
  const cardMaxHeight = isKeyboardVisible
    ? Math.max(Math.min(height - keyboardHeight - 118, 460), 320)
    : undefined;
  const outerScrollEnabled = !isKeyboardVisible && (mode === 'register' || isCompactHeight);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, (event: KeyboardEvent) => {
      setIsKeyboardVisible(true);
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);
  const bannerStyle =
    bannerTone === 'error'
      ? styles.bannerError
      : bannerTone === 'success'
        ? styles.bannerSuccess
        : styles.bannerInfo;
  const bannerLabelStyle =
    bannerTone === 'error'
      ? styles.bannerLabelError
      : bannerTone === 'success'
        ? styles.bannerLabelSuccess
        : styles.bannerLabelInfo;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        bounces={false}
        contentContainerStyle={[
          styles.screenPadding,
          isKeyboardVisible ? styles.screenPaddingKeyboard : null,
          {
            minHeight: height,
          },
        ]}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={outerScrollEnabled}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.backgroundOrbPrimary} />
        <View style={styles.backgroundOrbSecondary} />
        <View
          style={[
            styles.pageChrome,
            shouldCompact ? styles.pageChromeCompact : null,
            isKeyboardVisible ? styles.pageChromeKeyboard : null,
          ]}
        >
          <View
            style={[
              styles.topBar,
              isKeyboardVisible ? styles.topBarKeyboard : null,
            ]}
          >
            <View style={styles.brandChip}>
              <View style={styles.brandMark}>
                <View style={styles.brandMarkInner} />
              </View>
              <Text style={styles.brandText}>FIX Mobile</Text>
            </View>
          </View>

          <View
            style={[
              styles.cardRail,
              shouldCompact ? styles.cardRailCompact : null,
              isKeyboardVisible ? styles.cardRailKeyboard : null,
              {
                paddingTop: cardTopOffset,
              },
            ]}
          >
            <View
              style={[
                styles.formCard,
                shouldCompact ? styles.formCardCompact : null,
                isKeyboardVisible ? styles.formCardKeyboard : null,
                cardMaxHeight
                  ? {
                      maxHeight: cardMaxHeight,
                    }
                  : null,
              ]}
            >
              <View
                style={[
                  styles.introBlock,
                  isKeyboardVisible ? styles.introBlockKeyboard : null,
                ]}
              >
                <Text
                  style={[
                    styles.introTitle,
                    isKeyboardVisible ? styles.introTitleKeyboard : null,
                  ]}
                >
                  {title}
                </Text>
                {!isKeyboardVisible && subtitle ? (
                  <Text style={styles.introSubtitle}>{subtitle}</Text>
                ) : null}
              </View>
              {showModeToggle ? (
                <View
                  style={[
                    styles.tabs,
                    isKeyboardVisible ? styles.tabsKeyboard : null,
                  ]}
                >
                  <Pressable
                    onPress={onLoginPress}
                    style={[
                      styles.tabButton,
                      mode === 'login' ? styles.tabButtonActive : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabButtonText,
                        mode === 'login' ? styles.tabButtonTextActive : null,
                      ]}
                    >
                      로그인
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={onRegisterPress}
                    style={[
                      styles.tabButton,
                      mode === 'register' ? styles.tabButtonActive : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabButtonText,
                        mode === 'register' ? styles.tabButtonTextActive : null,
                      ]}
                    >
                      회원가입
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              <ScrollView
                bounces={false}
                contentContainerStyle={[
                  styles.cardContentScroll,
                  isKeyboardVisible ? styles.cardContentScrollKeyboard : null,
                ]}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                scrollEnabled={isKeyboardVisible}
                showsVerticalScrollIndicator={false}
              >
                {bannerMessage ? (
                  <View
                    style={[
                      styles.banner,
                      bannerStyle,
                      isKeyboardVisible ? styles.bannerKeyboard : null,
                    ]}
                  >
                    <Text style={[styles.bannerLabel, bannerLabelStyle]}>
                      {bannerToneLabel[bannerTone]}
                    </Text>
                    <Text style={styles.bannerMessage}>{bannerMessage}</Text>
                  </View>
                ) : null}

                <View
                  style={[
                    styles.formBody,
                    isKeyboardVisible ? styles.formBodyKeyboard : null,
                  ]}
                >
                  {children}
                </View>
              </ScrollView>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};
