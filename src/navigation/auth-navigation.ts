export type AuthRoute = 'login' | 'register';
export type ProtectedRoute = 'portfolio';
export type WelcomeVariant = 'login' | 'register' | null;

export interface AuthNavigationState {
  stack: 'auth' | 'app';
  authRoute: AuthRoute;
  protectedRoute: ProtectedRoute;
  pendingProtectedRoute: ProtectedRoute;
  welcomeVariant: WelcomeVariant;
}

export const createAuthNavigationState = (): AuthNavigationState => ({
  stack: 'auth',
  authRoute: 'login',
  protectedRoute: 'portfolio',
  pendingProtectedRoute: 'portfolio',
  welcomeVariant: null,
});

export const openLoginRoute = (
  state: AuthNavigationState,
): AuthNavigationState => ({
  ...state,
  stack: 'auth',
  authRoute: 'login',
  welcomeVariant: null,
});

export const openRegisterRoute = (
  state: AuthNavigationState,
): AuthNavigationState => ({
  ...state,
  stack: 'auth',
  authRoute: 'register',
  welcomeVariant: null,
});

export const enterAuthenticatedApp = (
  state: AuthNavigationState,
  options?: {
    route?: ProtectedRoute;
    source?: Exclude<WelcomeVariant, null>;
  },
): AuthNavigationState => {
  const targetRoute =
    options?.route ?? state.pendingProtectedRoute ?? state.protectedRoute;

  return {
    ...state,
    stack: 'app',
    protectedRoute: targetRoute,
    pendingProtectedRoute: targetRoute,
    welcomeVariant: options?.source ?? null,
  };
};

export const requireReauthRoute = (
  state: AuthNavigationState,
  route?: ProtectedRoute,
): AuthNavigationState => {
  const targetRoute = route ?? state.protectedRoute;

  return {
    ...state,
    stack: 'auth',
    authRoute: 'login',
    protectedRoute: targetRoute,
    pendingProtectedRoute: targetRoute,
    welcomeVariant: null,
  };
};
