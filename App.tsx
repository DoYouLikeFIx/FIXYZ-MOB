import {
  useRef,
} from 'react';
import {
  LogBox,
} from 'react-native';

import { createMobileAuthRuntime } from './src/auth/create-mobile-auth-runtime';
import { useAuthFlowViewModel } from './src/auth/use-auth-flow-view-model';
import {
  authStore,
} from './src/store/auth-store';
import {
  isMotionDisabled,
  resetMobileLaunchArgumentsCache,
  shouldHideDevWarningsOverlay,
} from './src/config/runtime-options';
import { AppNavigator } from './src/navigation/AppNavigator';

const App = () => {
  const runtimeRef = useRef<ReturnType<typeof createMobileAuthRuntime> | null>(null);
  const animationsDisabledRef = useRef(false);
  const hideDevWarningsOverlayRef = useRef(false);
  const warningsHiddenRef = useRef(false);

  if (runtimeRef.current === null) {
    resetMobileLaunchArgumentsCache();
    runtimeRef.current = createMobileAuthRuntime();
    animationsDisabledRef.current = isMotionDisabled();
    hideDevWarningsOverlayRef.current = shouldHideDevWarningsOverlay();
  }

  if (
    !warningsHiddenRef.current
    && hideDevWarningsOverlayRef.current
    && LogBox
    && typeof LogBox.ignoreAllLogs === 'function'
  ) {
    LogBox.ignoreAllLogs();
    warningsHiddenRef.current = true;
  }

  const authFlow = useAuthFlowViewModel({
    authService: runtimeRef.current.authService,
    authStore,
  });

  return (
    <AppNavigator
      accountApi={runtimeRef.current.accountApi}
      animationsDisabled={animationsDisabledRef.current}
      orderApi={runtimeRef.current.orderApi}
      {...authFlow}
    />
  );
};

export default App;
