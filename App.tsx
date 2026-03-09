import {
  useRef,
} from 'react';

import { createMobileAuthRuntime } from './src/auth/create-mobile-auth-runtime';
import { useAuthFlowViewModel } from './src/auth/use-auth-flow-view-model';
import { isMotionDisabled } from './src/config/runtime-options';
import { AppNavigator } from './src/navigation/AppNavigator';

const App = () => {
  const runtimeRef = useRef<ReturnType<typeof createMobileAuthRuntime> | null>(null);
  const animationsDisabledRef = useRef(isMotionDisabled());

  if (runtimeRef.current === null) {
    runtimeRef.current = createMobileAuthRuntime();
  }

  const authFlow = useAuthFlowViewModel({
    authApi: runtimeRef.current.authApi,
    csrfManager: runtimeRef.current.csrfManager,
  });

  return (
    <AppNavigator
      animationsDisabled={animationsDisabledRef.current}
      {...authFlow}
    />
  );
};

export default App;
