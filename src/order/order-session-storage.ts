const STORAGE_KEY_PREFIX = 'fixyz.order-session-id:';

const storageMirror = new Map<string, string>();

type OrderSessionSecureStore = {
  get: (key: string) => Promise<string | null>;
  remove: (key: string) => Promise<void>;
  set: (key: string, value: string) => Promise<void>;
};

interface OrderSessionStorageRuntime {
  isReactNativeRuntime: () => boolean;
  loadSecureStore: () => Promise<OrderSessionSecureStore>;
}

export class OrderSessionStorageError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'OrderSessionStorageError';
    this.code = code;
  }
}

const createStorageError = (
  code: string,
  message: string,
  cause: unknown,
) => new OrderSessionStorageError(code, message, { cause });

const createDefaultRuntime = (): OrderSessionStorageRuntime => ({
  isReactNativeRuntime: () =>
    typeof navigator !== 'undefined'
    && navigator.product === 'ReactNative',
  loadSecureStore: async () => {
    const [secureStorageModule, keychainModule] = await Promise.all([
      import('../security/secure-storage'),
      import('../security/react-native-keychain-storage'),
    ]);

    const secureStore = new secureStorageModule.SecureSecretStore(
      new keychainModule.ReactNativeKeychainStorage(),
    );

    return {
      get: (key: string) => secureStore.get(key),
      remove: (key: string) => secureStore.remove(key),
      set: (key: string, value: string) =>
        secureStore.set(
          key,
          value,
          secureStorageModule.SecretClassification.AllowedNonSensitive,
        ),
    };
  },
});

let runtime = createDefaultRuntime();
let secureStorePromise: Promise<OrderSessionSecureStore | null> | null = null;

const storageKey = (accountId: string) => `${STORAGE_KEY_PREFIX}${accountId}`;

const getSecureStore = async () => {
  if (!runtime.isReactNativeRuntime()) {
    return null;
  }

  if (secureStorePromise === null) {
    secureStorePromise = runtime
      .loadSecureStore()
      .catch((error) => {
        secureStorePromise = null;
        throw createStorageError(
          'MOB-ORD-001',
          '주문 세션 복원 저장소를 초기화하지 못했습니다. 앱을 다시 시작해 주세요.',
          error,
        );
      });
  }

  return secureStorePromise;
};

export const persistOrderSessionId = async (
  accountId: string | undefined,
  orderSessionId: string,
) => {
  if (!accountId) {
    return;
  }

  const key = storageKey(accountId);
  const secureStore = await getSecureStore();
  if (secureStore !== null) {
    try {
      await secureStore.set(key, orderSessionId);
    } catch (error) {
      throw createStorageError(
        'MOB-ORD-002',
        '주문 세션을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.',
        error,
      );
    }
  }

  storageMirror.set(key, orderSessionId);
};

export const readPersistedOrderSessionId = async (
  accountId: string | undefined,
) => {
  if (!accountId) {
    return null;
  }

  const key = storageKey(accountId);
  const mirrored = storageMirror.get(key);
  if (mirrored !== undefined) {
    return mirrored;
  }

  const secureStore = await getSecureStore();
  if (secureStore === null) {
    return null;
  }

  let stored: string | null;
  try {
    stored = await secureStore.get(key);
  } catch (error) {
    throw createStorageError(
      'MOB-ORD-003',
      '저장된 주문 세션을 불러오지 못했습니다. 다시 시도해 주세요.',
      error,
    );
  }

  if (stored !== null) {
    storageMirror.set(key, stored);
  }
  return stored;
};

export const clearPersistedOrderSessionId = async (accountId: string | undefined) => {
  if (!accountId) {
    return;
  }

  const key = storageKey(accountId);
  const mirrored = storageMirror.get(key);

  const secureStore = await getSecureStore();
  if (secureStore === null) {
    storageMirror.delete(key);
    return;
  }

  try {
    await secureStore.remove(key);
    storageMirror.delete(key);
  } catch (error) {
    if (mirrored !== undefined) {
      storageMirror.set(key, mirrored);
    }
    throw createStorageError(
      'MOB-ORD-004',
      '주문 세션 정리를 완료하지 못했습니다. 다시 시도해 주세요.',
      error,
    );
  }
};

export const __resetOrderSessionStorageForTests = () => {
  storageMirror.clear();
  secureStorePromise = null;
  runtime = createDefaultRuntime();
};

export const __setOrderSessionStorageRuntimeForTests = (
  nextRuntime: Partial<OrderSessionStorageRuntime>,
) => {
  runtime = {
    ...createDefaultRuntime(),
    ...nextRuntime,
  };
  secureStorePromise = null;
};

export const __clearOrderSessionStorageMirrorForTests = () => {
  storageMirror.clear();
};
