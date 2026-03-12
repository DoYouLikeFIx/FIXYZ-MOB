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
  challenge: LoginChallenge = challengeFixture,
) => create(
  <TotpEnrollmentScreen
    challenge={challenge}
    onLoadEnrollment={onLoadEnrollment}
    onLoginPress={() => {}}
    onRegisterPress={() => {}}
    onRestartLogin={() => {}}
    onSubmit={async () => ({ success: true })}
  />,
);

describe('TotpEnrollmentScreen', () => {
  let renderer: ReturnType<typeof create> | null = null;
  const getRendererRoot = () => {
    if (!renderer) {
      throw new Error('Renderer has not been created yet.');
    }

    return renderer.root;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer?.unmount();
      });
    }
    renderer = null;
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

    act(() => {
      renderer = renderScreen(onLoadEnrollment);
    });

    expect(onLoadEnrollment).toHaveBeenCalledTimes(1);
    expect(findAllByTestId(getRendererRoot(), 'totp-enroll-loading')).toHaveLength(1);

    await act(async () => {
      deferredBootstrap.resolve(failureResult);
      await flushPromises();
    });

    await act(async () => {
      await flushPromises();
    });

    expect(onLoadEnrollment).toHaveBeenCalledTimes(1);
    expect(findAllByTestId(getRendererRoot(), 'totp-enroll-loading')).toHaveLength(0);
    expect(findAllByTestId(getRendererRoot(), 'totp-enroll-retry')).toHaveLength(1);
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

    const retryButton = findByTestId(getRendererRoot(), 'totp-enroll-retry');

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

    act(() => {
      renderer = renderScreen(onLoadEnrollment);
    });

    await act(async () => {
      await flushPromises();
    });

    const openAuthenticatorButton = findByTestId(
      getRendererRoot(),
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

  it('ignores a stale enrollment bootstrap response after the challenge token changes', async () => {
    const firstBootstrap = createDeferred<TotpEnrollmentBootstrapResult>();
    const secondBootstrap = createDeferred<TotpEnrollmentBootstrapResult>();
    const onLoadEnrollment = vi
      .fn<() => Promise<TotpEnrollmentBootstrapResult>>()
      .mockImplementationOnce(() => firstBootstrap.promise)
      .mockImplementationOnce(() => secondBootstrap.promise);

    act(() => {
      renderer = renderScreen(onLoadEnrollment);
    });

    expect(onLoadEnrollment).toHaveBeenCalledTimes(1);

    const nextChallenge: LoginChallenge = {
      ...challengeFixture,
      loginToken: 'login-token-2',
      expiresAt: '2026-03-12T10:12:00Z',
    };

    await act(async () => {
      renderer?.update(
        <TotpEnrollmentScreen
          challenge={nextChallenge}
          onLoadEnrollment={onLoadEnrollment}
          onLoginPress={() => {}}
          onRegisterPress={() => {}}
          onRestartLogin={() => {}}
          onSubmit={async () => ({ success: true })}
        />,
      );
      await flushPromises();
    });

    expect(onLoadEnrollment).toHaveBeenCalledTimes(2);

    await act(async () => {
      firstBootstrap.resolve({
        success: true,
        enrollment: {
          qrUri: 'otpauth://totp/FIX:demo@fix.com?secret=OLD123',
          manualEntryKey: 'OLD123',
          enrollmentToken: 'enrollment-token-old',
          expiresAt: '2026-03-12T10:08:00Z',
        },
      });
      await flushPromises();
    });

    expect(findAllByTestId(getRendererRoot(), 'totp-enroll-manual-key')).toHaveLength(0);

    await act(async () => {
      secondBootstrap.resolve({
        success: true,
        enrollment: {
          qrUri: 'otpauth://totp/FIX:demo@fix.com?secret=NEW456',
          manualEntryKey: 'NEW456',
          enrollmentToken: 'enrollment-token-new',
          expiresAt: '2026-03-12T10:12:00Z',
        },
      });
      await flushPromises();
    });

    expect(findByTestId(getRendererRoot(), 'totp-enroll-manual-key').props.children).toBe('NEW456');
  });
});
