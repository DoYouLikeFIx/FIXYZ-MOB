import {
  __clearOrderSessionStorageMirrorForTests,
  __resetOrderSessionStorageForTests,
  __setOrderSessionStorageRuntimeForTests,
  clearPersistedOrderSessionId,
  persistOrderSessionId,
  readPersistedOrderSessionId,
} from '@/order/order-session-storage';

describe('order session storage', () => {
  beforeEach(() => {
    __resetOrderSessionStorageForTests();
  });

  it('persists and clears session ids in the non-react-native fallback path', async () => {
    await persistOrderSessionId('1', 'sess-local');

    await expect(readPersistedOrderSessionId('1')).resolves.toBe('sess-local');

    await clearPersistedOrderSessionId('1');

    await expect(readPersistedOrderSessionId('1')).resolves.toBeNull();
  });

  it('uses the injected secure store in react-native runtime', async () => {
    let persistedValue: string | null = 'sess-rn';
    const secureStore = {
      get: vi.fn().mockImplementation(async () => persistedValue),
      remove: vi.fn().mockImplementation(async () => {
        persistedValue = null;
      }),
      set: vi.fn().mockImplementation(async (_key: string, value: string) => {
        persistedValue = value;
      }),
    };

    __setOrderSessionStorageRuntimeForTests({
      isReactNativeRuntime: () => true,
      loadSecureStore: vi.fn().mockResolvedValue(secureStore),
    });

    await expect(readPersistedOrderSessionId('1')).resolves.toBe('sess-rn');
    expect(secureStore.get).toHaveBeenCalledWith('fixyz.order-session-id:1');

    await persistOrderSessionId('1', 'sess-write');
    expect(secureStore.set).toHaveBeenCalledWith(
      'fixyz.order-session-id:1',
      'sess-write',
    );
    __clearOrderSessionStorageMirrorForTests();
    await expect(readPersistedOrderSessionId('1')).resolves.toBe('sess-write');
    expect(secureStore.get).toHaveBeenCalledWith('fixyz.order-session-id:1');

    await clearPersistedOrderSessionId('1');
    expect(secureStore.remove).toHaveBeenCalledWith('fixyz.order-session-id:1');
  });

  it('fails with a deterministic error when secure-store initialization breaks', async () => {
    __setOrderSessionStorageRuntimeForTests({
      isReactNativeRuntime: () => true,
      loadSecureStore: vi.fn().mockRejectedValue(new Error('keychain unavailable')),
    });

    await expect(readPersistedOrderSessionId('1')).rejects.toMatchObject({
      code: 'MOB-ORD-001',
      name: 'OrderSessionStorageError',
    });
  });

  it('retries secure-store bootstrap after a transient initialization failure', async () => {
    const secureStore = {
      get: vi.fn().mockResolvedValue('sess-rn'),
      remove: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
    };
    const loadSecureStore = vi.fn()
      .mockRejectedValueOnce(new Error('keychain unavailable'))
      .mockResolvedValueOnce(secureStore);

    __setOrderSessionStorageRuntimeForTests({
      isReactNativeRuntime: () => true,
      loadSecureStore,
    });

    await expect(readPersistedOrderSessionId('1')).rejects.toMatchObject({
      code: 'MOB-ORD-001',
      name: 'OrderSessionStorageError',
    });
    await expect(readPersistedOrderSessionId('1')).resolves.toBe('sess-rn');
    expect(loadSecureStore).toHaveBeenCalledTimes(2);
  });

  it('does not keep the in-memory mirror when secure-store writes fail', async () => {
    const secureStore = {
      get: vi.fn().mockResolvedValue(null),
      remove: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockRejectedValue(new Error('set failed')),
    };

    __setOrderSessionStorageRuntimeForTests({
      isReactNativeRuntime: () => true,
      loadSecureStore: vi.fn().mockResolvedValue(secureStore),
    });

    await expect(persistOrderSessionId('1', 'sess-write')).rejects.toMatchObject({
      code: 'MOB-ORD-002',
      name: 'OrderSessionStorageError',
    });
    await expect(readPersistedOrderSessionId('1')).resolves.toBeNull();
  });

  it('preserves the in-memory mirror when secure-store removal fails', async () => {
    const secureStore = {
      get: vi.fn().mockResolvedValue('sess-rn'),
      remove: vi.fn().mockRejectedValue(new Error('remove failed')),
      set: vi.fn().mockResolvedValue(undefined),
    };

    __setOrderSessionStorageRuntimeForTests({
      isReactNativeRuntime: () => true,
      loadSecureStore: vi.fn().mockResolvedValue(secureStore),
    });

    await persistOrderSessionId('1', 'sess-rn');
    await expect(clearPersistedOrderSessionId('1')).rejects.toMatchObject({
      code: 'MOB-ORD-004',
      name: 'OrderSessionStorageError',
    });
    await expect(readPersistedOrderSessionId('1')).resolves.toBe('sess-rn');
  });

  it('surfaces deterministic restore guidance when secure-store reads fail', async () => {
    const secureStore = {
      get: vi.fn().mockRejectedValue(new Error('read failed')),
      remove: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
    };

    __setOrderSessionStorageRuntimeForTests({
      isReactNativeRuntime: () => true,
      loadSecureStore: vi.fn().mockResolvedValue(secureStore),
    });

    await expect(readPersistedOrderSessionId('1')).rejects.toMatchObject({
      code: 'MOB-ORD-003',
      name: 'OrderSessionStorageError',
    });
  });
});
