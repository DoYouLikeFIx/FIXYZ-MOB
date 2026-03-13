import { Animated, Easing, StyleSheet } from 'react-native';
import { useLayoutEffect, useRef } from 'react';

import { BootScreen } from '../screens/auth/BootScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { LoginMfaScreen } from '../screens/auth/LoginMfaScreen';
import { MfaRecoveryRebindScreen } from '../screens/auth/MfaRecoveryRebindScreen';
import { MfaRecoveryScreen } from '../screens/auth/MfaRecoveryScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { ResetPasswordScreen } from '../screens/auth/ResetPasswordScreen';
import { TotpEnrollmentScreen } from '../screens/auth/TotpEnrollmentScreen';
import { AuthenticatedHomeScreen } from '../screens/app/AuthenticatedHomeScreen';
import type { AccountApi } from '../api/account-api';
import type { OrderApi } from '../api/order-api';
import type {
  MfaRecoveryState,
  RestartMfaRecoveryOptions,
} from '../auth/auth-flow-view-model';
import type { AuthStatus } from '../store/auth-store';
import type {
  LoginChallenge,
  Member,
  MemberTotpRebindRequest,
  MfaRecoveryRebindConfirmRequest,
  TotpEnrollmentConfirmationRequest,
  TotpVerificationRequest,
} from '../types/auth';
import type {
  LoginRequest,
  PasswordForgotRequest,
  PasswordRecoveryChallengeRequest,
  PasswordResetRequest,
  RegisterRequest,
} from '../types/auth';
import type {
  FormSubmissionResult,
  MfaRecoveryRebindConfirmationResult,
  PasswordForgotResult,
  PasswordRecoveryChallengeResult,
  PasswordResetResult,
  TotpRebindBootstrapResult,
  TotpEnrollmentBootstrapResult,
} from '../types/auth-ui';

import type { AuthNavigationState } from './auth-navigation';

interface AppNavigatorProps {
  accountApi: AccountApi;
  animationsDisabled: boolean;
  orderApi: OrderApi;
  authStatus: AuthStatus;
  member: Member | null;
  reauthMessage: string | null;
  navigationState: AuthNavigationState;
  authBannerMessage: string | null;
  authBannerTone: 'info' | 'error' | 'success';
  bootstrapErrorMessage: string | null;
  protectedErrorMessage: string | null;
  isRefreshingSession: boolean;
  pendingMfa: LoginChallenge | null;
  mfaRecovery: MfaRecoveryState | null;
  onLoginSubmit: (payload: LoginRequest) => Promise<FormSubmissionResult>;
  onLoginMfaSubmit: (payload: TotpVerificationRequest) => Promise<FormSubmissionResult>;
  onRegisterSubmit: (payload: RegisterRequest) => Promise<FormSubmissionResult>;
  onOpenLogin: () => void;
  onRequireEnrollmentRestart: (message: string) => void;
  onOpenRegister: () => void;
  onOpenForgotPassword: () => void;
  onOpenResetPassword: (token?: string) => void;
  onOpenAuthenticatedMfaRecovery: () => void;
  onResetPendingMfa: () => void;
  onLoadTotpEnrollment: () => Promise<TotpEnrollmentBootstrapResult>;
  onSubmitTotpEnrollment: (
    payload: TotpEnrollmentConfirmationRequest,
  ) => Promise<FormSubmissionResult>;
  onPasswordForgotSubmit: (payload: PasswordForgotRequest) => Promise<PasswordForgotResult>;
  onPasswordChallengeSubmit: (
    payload: PasswordRecoveryChallengeRequest,
  ) => Promise<PasswordRecoveryChallengeResult>;
  onPasswordResetSubmit: (payload: PasswordResetRequest) => Promise<PasswordResetResult>;
  onAuthenticatedMfaRecoveryBootstrap: (
    payload: MemberTotpRebindRequest,
  ) => Promise<TotpRebindBootstrapResult>;
  onRecoveryMfaRecoveryBootstrap: () => Promise<TotpRebindBootstrapResult>;
  onRestartMfaRecovery: (options?: RestartMfaRecoveryOptions) => void;
  onSubmitMfaRecoveryRebind: (
    payload: MfaRecoveryRebindConfirmRequest,
  ) => Promise<MfaRecoveryRebindConfirmationResult>;
  onRefreshProtectedSession: () => void;
}

const getRouteKey = (
  authStatus: AuthStatus,
  navigationState: AuthNavigationState,
  member: Member | null,
  pendingMfa: LoginChallenge | null,
): string => {
  if (authStatus === 'checking') {
    return 'boot';
  }

  if (navigationState.stack === 'app' && member) {
    return `app:${navigationState.protectedRoute}:${navigationState.welcomeVariant ?? 'idle'}`;
  }

  return `auth:${navigationState.authRoute}:${pendingMfa?.nextAction ?? 'idle'}`;
};

const getTransitionOffset = (previousKey: string, nextKey: string): number => {
  const isAuthRouteKey = (routeKey: string, authRoute: string) =>
    routeKey.startsWith(`auth:${authRoute}:`);

  if (previousKey === nextKey) {
    return 0;
  }

  if (
    isAuthRouteKey(previousKey, 'login')
    && isAuthRouteKey(nextKey, 'register')
  ) {
    return 34;
  }

  if (
    isAuthRouteKey(previousKey, 'register')
    && isAuthRouteKey(nextKey, 'login')
  ) {
    return -34;
  }

  if (previousKey.startsWith('auth:') && nextKey.startsWith('auth:')) {
    return isAuthRouteKey(nextKey, 'login') ? -24 : 24;
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
  accountApi,
  animationsDisabled,
  orderApi,
  authStatus,
  member,
  reauthMessage,
  navigationState,
  authBannerMessage,
  authBannerTone,
  bootstrapErrorMessage,
  protectedErrorMessage,
  isRefreshingSession,
  pendingMfa,
  mfaRecovery,
  onLoginSubmit,
  onLoginMfaSubmit,
  onRegisterSubmit,
  onOpenLogin,
  onRequireEnrollmentRestart,
  onOpenRegister,
  onOpenForgotPassword,
  onOpenResetPassword,
  onOpenAuthenticatedMfaRecovery,
  onResetPendingMfa,
  onLoadTotpEnrollment,
  onSubmitTotpEnrollment,
  onPasswordForgotSubmit,
  onPasswordChallengeSubmit,
  onPasswordResetSubmit,
  onAuthenticatedMfaRecoveryBootstrap,
  onRecoveryMfaRecoveryBootstrap,
  onRestartMfaRecovery,
  onSubmitMfaRecoveryRebind,
  onRefreshProtectedSession,
}: AppNavigatorProps) => {
  const routeKey = getRouteKey(authStatus, navigationState, member, pendingMfa);
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
        accountApi={accountApi}
        isRefreshingSession={isRefreshingSession}
        member={member}
        orderApi={orderApi}
        onOpenMfaRecovery={onOpenAuthenticatedMfaRecovery}
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
  } else if (
    navigationState.authRoute === 'login' &&
    pendingMfa?.nextAction === 'VERIFY_TOTP'
  ) {
    screen = (
      <LoginMfaScreen
        bannerMessage={reauthMessage ?? authBannerMessage ?? bootstrapErrorMessage}
        bannerTone={
          reauthMessage
            ? 'info'
            : authBannerMessage
              ? authBannerTone
              : 'error'
        }
        challenge={pendingMfa}
        onForgotPasswordPress={onOpenForgotPassword}
        onLoginPress={onOpenLogin}
        onRegisterPress={onOpenRegister}
        onRestartLogin={onResetPendingMfa}
        onSubmit={onLoginMfaSubmit}
      />
    );
  } else if (navigationState.authRoute === 'forgotPassword') {
    screen = (
      <ForgotPasswordScreen
        onLoginPress={onOpenLogin}
        onRegisterPress={onOpenRegister}
        onResetPasswordPress={onOpenResetPassword}
        onSubmit={onPasswordForgotSubmit}
        onSubmitChallenge={onPasswordChallengeSubmit}
      />
    );
  } else if (
    navigationState.authRoute === 'mfaRecoveryRebind'
    && mfaRecovery?.bootstrap
  ) {
    screen = (
      <MfaRecoveryRebindScreen
        bootstrap={mfaRecovery.bootstrap}
        onLoginPress={onOpenLogin}
        onRegisterPress={onOpenRegister}
        onRestartRecovery={onRestartMfaRecovery}
        onSubmit={onSubmitMfaRecoveryRebind}
      />
    );
  } else if (
    navigationState.authRoute === 'mfaRecovery'
    || navigationState.authRoute === 'mfaRecoveryRebind'
  ) {
    screen = (
      <MfaRecoveryScreen
        authStatus={authStatus}
        bannerMessage={authBannerMessage}
        bannerTone={authBannerTone}
        member={member}
        mfaRecovery={mfaRecovery}
        onBootstrapAuthenticated={onAuthenticatedMfaRecoveryBootstrap}
        onBootstrapRecovery={onRecoveryMfaRecoveryBootstrap}
        onRestartRecovery={onRestartMfaRecovery}
        onRequireEnrollmentRestart={onRequireEnrollmentRestart}
        onForgotPasswordPress={onOpenForgotPassword}
        onLoginPress={onOpenLogin}
        onRegisterPress={onOpenRegister}
      />
    );
  } else if (navigationState.authRoute === 'resetPassword') {
    screen = (
      <ResetPasswordScreen
        initialToken={navigationState.resetPasswordToken ?? undefined}
        onForgotPasswordPress={onOpenForgotPassword}
        onLoginPress={onOpenLogin}
        onSubmit={onPasswordResetSubmit}
      />
    );
  } else if (
    navigationState.authRoute === 'totpEnroll' &&
    pendingMfa?.nextAction === 'ENROLL_TOTP'
  ) {
    screen = (
      <TotpEnrollmentScreen
        bannerMessage={reauthMessage ?? authBannerMessage ?? bootstrapErrorMessage}
        bannerTone={
          reauthMessage
            ? 'info'
            : authBannerMessage
              ? authBannerTone
              : 'error'
        }
        challenge={pendingMfa}
        onLoadEnrollment={onLoadTotpEnrollment}
        onLoginPress={onOpenLogin}
        onRegisterPress={onOpenRegister}
        onRestartLogin={onResetPendingMfa}
        onSubmit={onSubmitTotpEnrollment}
      />
    );
  } else {
    screen = (
      <LoginScreen
        bannerMessage={reauthMessage ?? authBannerMessage ?? bootstrapErrorMessage}
        bannerTone={
          reauthMessage
            ? 'info'
            : authBannerMessage
              ? authBannerTone
              : 'error'
        }
        onForgotPasswordPress={onOpenForgotPassword}
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
