import { Animated, Easing, StyleSheet } from 'react-native';
import { useLayoutEffect, useRef } from 'react';

import { BootScreen } from '../screens/auth/BootScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { AuthenticatedHomeScreen } from '../screens/app/AuthenticatedHomeScreen';
import type { AuthStatus } from '../store/auth-store';
import type { Member } from '../types/auth';
import type { LoginRequest, RegisterRequest } from '../types/auth';
import type { AuthMutationResult } from '../auth/mobile-auth-service';

import type { AuthNavigationState } from './auth-navigation';

interface AppNavigatorProps {
  animationsDisabled: boolean;
  authStatus: AuthStatus;
  member: Member | null;
  reauthMessage: string | null;
  navigationState: AuthNavigationState;
  bootstrapErrorMessage: string | null;
  protectedErrorMessage: string | null;
  isRefreshingSession: boolean;
  onLoginSubmit: (payload: LoginRequest) => Promise<AuthMutationResult>;
  onRegisterSubmit: (payload: RegisterRequest) => Promise<AuthMutationResult>;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
  onRefreshProtectedSession: () => void;
}

const getRouteKey = (
  authStatus: AuthStatus,
  navigationState: AuthNavigationState,
  member: Member | null,
): string => {
  if (authStatus === 'checking') {
    return 'boot';
  }

  if (navigationState.stack === 'app' && member) {
    return `app:${navigationState.protectedRoute}:${navigationState.welcomeVariant ?? 'idle'}`;
  }

  return `auth:${navigationState.authRoute}`;
};

const getTransitionOffset = (previousKey: string, nextKey: string): number => {
  if (previousKey === nextKey) {
    return 0;
  }

  if (previousKey === 'auth:login' && nextKey === 'auth:register') {
    return 34;
  }

  if (previousKey === 'auth:register' && nextKey === 'auth:login') {
    return -34;
  }

  if (nextKey.startsWith('app:')) {
    return 20;
  }

  if (previousKey.startsWith('app:') && nextKey.startsWith('auth:')) {
    return -20;
  }

  return 18;
};

export const AppNavigator = ({
  animationsDisabled,
  authStatus,
  member,
  reauthMessage,
  navigationState,
  bootstrapErrorMessage,
  protectedErrorMessage,
  isRefreshingSession,
  onLoginSubmit,
  onRegisterSubmit,
  onOpenLogin,
  onOpenRegister,
  onRefreshProtectedSession,
}: AppNavigatorProps) => {
  const routeKey = getRouteKey(authStatus, navigationState, member);
  const previousRouteKeyRef = useRef(routeKey);
  const opacity = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useLayoutEffect(() => {
    if (animationsDisabled) {
      opacity.setValue(1);
      translateX.setValue(0);
      scale.setValue(1);
      previousRouteKeyRef.current = routeKey;
      return;
    }

    const previousKey = previousRouteKeyRef.current;
    const offset = getTransitionOffset(previousKey, routeKey);

    if (offset === 0) {
      previousRouteKeyRef.current = routeKey;
      return;
    }

    opacity.setValue(0);
    translateX.setValue(offset);
    scale.setValue(0.985);

    Animated.parallel([
      Animated.timing(opacity, {
        duration: 240,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        duration: 280,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        duration: 260,
        easing: Easing.out(Easing.ease),
        toValue: 1,
        useNativeDriver: true,
      }),
    ]).start();

    previousRouteKeyRef.current = routeKey;
  }, [animationsDisabled, opacity, routeKey, scale, translateX]);

  let screen = null;

  if (authStatus === 'checking') {
    screen = <BootScreen />;
  } else if (navigationState.stack === 'app' && member) {
    screen = (
      <AuthenticatedHomeScreen
        isRefreshingSession={isRefreshingSession}
        member={member}
        onRefreshSession={onRefreshProtectedSession}
        sessionErrorMessage={protectedErrorMessage}
        welcomeVariant={navigationState.welcomeVariant}
      />
    );
  } else if (navigationState.authRoute === 'register') {
    screen = (
      <RegisterScreen
        onLoginPress={onOpenLogin}
        onSubmit={onRegisterSubmit}
      />
    );
  } else {
    screen = (
      <LoginScreen
        bannerMessage={reauthMessage ?? bootstrapErrorMessage}
        bannerTone={reauthMessage ? 'info' : 'error'}
        onLoginPress={onOpenLogin}
        onRegisterPress={onOpenRegister}
        onSubmit={onLoginSubmit}
      />
    );
  }

  return (
    <Animated.View
      style={[
        navigatorStyles.scene,
        {
          opacity,
          transform: [{ translateX }, { scale }],
        },
      ]}
    >
      {screen}
    </Animated.View>
  );
};

const navigatorStyles = StyleSheet.create({
  scene: {
    flex: 1,
  },
});
