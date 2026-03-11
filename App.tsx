import {
  useRef,
} from 'react';

import { createMobileAuthRuntime } from './src/auth/create-mobile-auth-runtime';
import { useAuthFlowViewModel } from './src/auth/use-auth-flow-view-model';
import {
  authStore,
} from './src/store/auth-store';
import {
  isMotionDisabled,
} from './src/config/runtime-options';
import { AppNavigator } from './src/navigation/AppNavigator';

const App = () => {
  const runtimeRef = useRef<ReturnType<typeof createMobileAuthRuntime> | null>(null);
  const animationsDisabledRef = useRef(isMotionDisabled());

  if (runtimeRef.current === null) {
    runtimeRef.current = createMobileAuthRuntime();
  }

  const authFlow = useAuthFlowViewModel({
    authService: runtimeRef.current.authService,
    authStore,
  });

  return (
    <AppNavigator
      animationsDisabled={animationsDisabledRef.current}
      {...authFlow}
    />
  );
};

export default App;
