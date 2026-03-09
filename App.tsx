import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { createMobileAuthController } from './src/auth/mobile-auth-controller';
import { createMobileAuthRuntime } from './src/auth/create-mobile-auth-runtime';
import { isMotionDisabled } from './src/config/runtime-options';
import { AppNavigator } from './src/navigation/AppNavigator';
import { createAuthNavigationState } from './src/navigation/auth-navigation';
import { authStore, useAuthStore } from './src/store/auth-store';
import type { RegisterFormValues } from './src/types/auth-ui';

const App = () => {
  const runtimeRef = useRef<ReturnType<typeof createMobileAuthRuntime> | null>(null);
  const animationsDisabledRef = useRef(isMotionDisabled());

  if (runtimeRef.current === null) {
    runtimeRef.current = createMobileAuthRuntime();
  }

  const [navigationState, setNavigationState] = useState(createAuthNavigationState);
  const [bootstrapErrorMessage, setBootstrapErrorMessage] = useState<string | null>(
    null,
  );
  const [protectedErrorMessage, setProtectedErrorMessage] = useState<string | null>(
    null,
  );
  const [isRefreshingSession, setIsRefreshingSession] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const navigationStateRef = useRef(navigationState);
  const isRefreshingSessionRef = useRef(false);

  navigationStateRef.current = navigationState;

  const authStatus = useAuthStore((state) => state.status);
  const member = useAuthStore((state) => state.member);
  const reauthMessage = useAuthStore((state) => state.reauthMessage);

  const controllerRef = useRef(
    createMobileAuthController({
      authApi: runtimeRef.current.authApi,
      authStore,
      csrfManager: runtimeRef.current.csrfManager,
      getNavigationState: () => navigationStateRef.current,
      setNavigationState: (nextState) => {
        startTransition(() => {
          setNavigationState(nextState);
        });
      },
    }),
  );

  useEffect(() => {
    let isMounted = true;

    void controllerRef.current.bootstrap().then((result) => {
      if (!isMounted) {
        return;
      }

      setBootstrapErrorMessage(result.errorMessage);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleProtectedSessionRefresh = useEffectEvent(
    async (reason: 'manual' | 'resume') => {
      if (isRefreshingSessionRef.current) {
        return;
      }

      isRefreshingSessionRef.current = true;
      setProtectedErrorMessage(null);
      setIsRefreshingSession(true);

      try {
        const result =
          reason === 'resume'
            ? await controllerRef.current.revalidateSessionOnResume()
            : await controllerRef.current.refreshProtectedSession();

        setProtectedErrorMessage(result.errorMessage);
      } finally {
        isRefreshingSessionRef.current = false;
        setIsRefreshingSession(false);
      }
    },
  );

  const handleAppStateChange = useEffectEvent((nextState: AppStateStatus) => {
    const previousState = appStateRef.current;
    appStateRef.current = nextState;

    if (
      (previousState === 'background' || previousState === 'inactive') &&
      nextState === 'active' &&
      authStore.getState().status === 'authenticated'
    ) {
      void handleProtectedSessionRefresh('resume');
    }
  });

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [handleAppStateChange]);

  const handleOpenLogin = () => {
    setBootstrapErrorMessage(null);
    setProtectedErrorMessage(null);
    controllerRef.current.openLogin();
  };

  const handleOpenRegister = () => {
    setBootstrapErrorMessage(null);
    setProtectedErrorMessage(null);
    controllerRef.current.openRegister();
  };

  const handleLoginSubmit = useEffectEvent(
    async (payload: { username: string; password: string }) => {
      setBootstrapErrorMessage(null);
      setProtectedErrorMessage(null);
      return controllerRef.current.submitLogin(payload);
    },
  );

  const handleRegisterSubmit = useEffectEvent(async (payload: RegisterFormValues) => {
    setBootstrapErrorMessage(null);
    setProtectedErrorMessage(null);
    return controllerRef.current.submitRegister(payload);
  });

  return (
    <AppNavigator
      animationsDisabled={animationsDisabledRef.current}
      authStatus={authStatus}
      bootstrapErrorMessage={bootstrapErrorMessage}
      isRefreshingSession={isRefreshingSession}
      member={member}
      navigationState={navigationState}
      onLoginSubmit={handleLoginSubmit}
      onOpenLogin={handleOpenLogin}
      onOpenRegister={handleOpenRegister}
      onRefreshProtectedSession={() => {
        void handleProtectedSessionRefresh('manual');
      }}
      onRegisterSubmit={handleRegisterSubmit}
      protectedErrorMessage={protectedErrorMessage}
      reauthMessage={reauthMessage}
    />
  );
};

export default App;
