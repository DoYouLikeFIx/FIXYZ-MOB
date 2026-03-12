import type { ReactTestInstance } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Linking } from 'react-native';

import { TotpEnrollmentScreen } from '@/screens/auth/TotpEnrollmentScreen';
import type { LoginChallenge } from '@/types/auth';
import type { TotpEnrollmentBootstrapResult } from '@/types/auth-ui';

const challengeFixture: LoginChallenge = {
  loginToken: 'login-token',
  nextAction: 'ENROLL_TOTP',
  totpEnrolled: false,
  expiresAt: '2026-03-12T10:05:00Z',
};

const findAllByTestId = (root: ReactTestInstance, testId: string) =>
  root.findAll((node) => node.props?.testID === testId);

const findByTestId = (root: ReactTestInstance, testId: string) => {
  const matches = findAllByTestId(root, testId);

  if (matches.length === 0) {
    throw new Error(`Unable to find node with testID=${testId}`);
  }

  return matches[0];
};

const flushPromises = async () => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const createDeferred = <T,>() => {
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  let rejectPromise!: (reason?: unknown) => void;

  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  };
};

const renderScreen = (
  onLoadEnrollment: () => Promise<TotpEnrollmentBootstrapResult>,
) => create(
  <TotpEnrollmentScreen
    challenge={challengeFixture}
    onLoadEnrollment={onLoadEnrollment}
    onLoginPress={() => {}}
    onRegisterPress={() => {}}
    onRestartLogin={() => {}}
    onSubmit={async () => ({ success: true })}
  />,
);

describe('TotpEnrollmentScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not loop enrollment bootstrap requests after an initial failure', async () => {
    const failureResult: TotpEnrollmentBootstrapResult = {
      success: false,
      error: {
        message: 'Authentication required',
        status: 401,
        code: 'AUTH-018',
      },
    };
    const deferredBootstrap = createDeferred<TotpEnrollmentBootstrapResult>();
    const onLoadEnrollment = vi.fn(() => deferredBootstrap.promise);
    let renderer!: ReturnType<typeof create>;

    act(() => {
      renderer = renderScreen(onLoadEnrollment);
    });

    expect(onLoadEnrollment).toHaveBeenCalledTimes(1);
    expect(findAllByTestId(renderer.root, 'totp-enroll-loading')).toHaveLength(1);

    await act(async () => {
      deferredBootstrap.resolve(failureResult);
      await flushPromises();
    });

    await act(async () => {
      await flushPromises();
    });

    expect(onLoadEnrollment).toHaveBeenCalledTimes(1);
    expect(findAllByTestId(renderer.root, 'totp-enroll-loading')).toHaveLength(0);
    expect(findAllByTestId(renderer.root, 'totp-enroll-retry')).toHaveLength(1);
  });

  it('retries enrollment bootstrap only when the user explicitly asks', async () => {
    const failureResult: TotpEnrollmentBootstrapResult = {
      success: false,
      error: {
        message: 'Authentication required',
        status: 401,
        code: 'AUTH-018',
      },
    };
    const initialBootstrap = createDeferred<TotpEnrollmentBootstrapResult>();
    const retryBootstrap = createDeferred<TotpEnrollmentBootstrapResult>();
    const onLoadEnrollment = vi
      .fn<() => Promise<TotpEnrollmentBootstrapResult>>()
      .mockImplementationOnce(() => initialBootstrap.promise)
      .mockImplementationOnce(() => retryBootstrap.promise);
    let renderer!: ReturnType<typeof create>;

    act(() => {
      renderer = renderScreen(onLoadEnrollment);
    });

    await act(async () => {
      initialBootstrap.resolve(failureResult);
      await flushPromises();
    });

    await act(async () => {
      await flushPromises();
    });

    const retryButton = findByTestId(renderer.root, 'totp-enroll-retry');

    await act(async () => {
      retryButton.props.onPress();
      await flushPromises();
    });

    await act(async () => {
      await flushPromises();
    });

    expect(onLoadEnrollment).toHaveBeenCalledTimes(2);
  });

  it('opens Google Authenticator with the enrollment URI when bootstrap succeeds', async () => {
    const onLoadEnrollment = vi.fn<() => Promise<TotpEnrollmentBootstrapResult>>(async () => ({
      success: true,
      enrollment: {
        qrUri: 'otpauth://totp/FIX:demo@fix.com?secret=ABC123',
        manualEntryKey: 'ABC123',
        enrollmentToken: 'enrollment-token',
        expiresAt: '2026-03-12T10:08:00Z',
      },
    }));
    let renderer!: ReturnType<typeof create>;

    act(() => {
      renderer = renderScreen(onLoadEnrollment);
    });

    await act(async () => {
      await flushPromises();
    });

    const openAuthenticatorButton = findByTestId(
      renderer.root,
      'totp-enroll-open-authenticator',
    );

    await act(async () => {
      openAuthenticatorButton.props.onPress();
      await flushPromises();
    });

    expect(Linking.openURL).toHaveBeenCalledWith(
      'otpauth://totp/FIX:demo@fix.com?secret=ABC123',
    );
  });
});
