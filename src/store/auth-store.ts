import { useSyncExternalStore } from 'react';

import type { Member } from '../types/auth';

export type AuthStatus = 'checking' | 'anonymous' | 'authenticated';

export interface AuthState {
  status: AuthStatus;
  member: Member | null;
  reauthMessage: string | null;
}

type Listener = () => void;

const createDefaultAuthState = (): AuthState => ({
  status: 'checking',
  member: null,
  reauthMessage: null,
});

class AuthStore {
  private state = createDefaultAuthState();

  private readonly listeners = new Set<Listener>();

  getState(): AuthState {
    return this.state;
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  initialize(member: Member | null) {
    this.setState({
      status: member ? 'authenticated' : 'anonymous',
      member,
      reauthMessage: null,
    });
  }

  login(member: Member) {
    this.setState({
      status: 'authenticated',
      member,
      reauthMessage: null,
    });
  }

  logout() {
    this.setState({
      status: 'anonymous',
      member: null,
      reauthMessage: null,
    });
  }

  requireReauth(message: string) {
    this.setState({
      status: 'anonymous',
      member: null,
      reauthMessage: message,
    });
  }

  clearReauthMessage() {
    this.setState({
      reauthMessage: null,
    });
  }

  reset() {
    this.state = createDefaultAuthState();
    this.emit();
  }

  private setState(nextPartial: Partial<AuthState>) {
    this.state = {
      ...this.state,
      ...nextPartial,
    };
    this.emit();
  }

  private emit() {
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const authStore = new AuthStore();

export const useAuthStore = <T,>(selector: (state: AuthState) => T): T =>
  useSyncExternalStore(
    authStore.subscribe,
    () => selector(authStore.getState()),
    () => selector(authStore.getState()),
  );

export const resetAuthStore = () => {
  authStore.reset();
};
