import { afterEach, describe, expect, it, vi } from 'vitest';

type StorageModule = typeof import('@/order/order-session-storage');

const loadOrderSessionStorageWithRuntime = async (options?: {
  keychainFactory?: () => {
    get: (key: string) => Promise<string | null>;
    remove: (key: string) => Promise<void>;
    set: (key: string, value: string) => Promise<void>;
  };
  navigatorProduct?: string;
  secureStoreModuleThrows?: boolean;
}) => {
  vi.resetModules();
  vi.unstubAllGlobals();

  vi.stubGlobal('navigator', {
    product: options?.navigatorProduct ?? 'ReactNative',
  });

  if (options?.secureStoreModuleThrows) {
    vi.doMock('@/security/react-native-keychain-storage', () => {
      throw new Error('keychain unavailable');
    });
  } else {
    const runtimeStorage = options?.keychainFactory?.() ?? {
      get: vi.fn().mockResolvedValue(null),
      remove: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
    };

    vi.doMock('@/security/react-native-keychain-storage', () => ({
      ReactNativeKeychainStorage: class {
        async get(key: string) {
          return runtimeStorage.get(key);
        }

        async remove(key: string) {
          return runtimeStorage.remove(key);
        }

        async set(key: string, value: string) {
          return runtimeStorage.set(key, value);
        }
      },
    }));
  }

  const storageModule = await import('@/order/order-session-storage');
  return storageModule as StorageModule;
};

afterEach(() => {
  vi.doUnmock('@/security/react-native-keychain-storage');
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('order session storage actual react-native runtime branch', () => {
  it('uses the navigator.product ReactNative branch with the real dynamic-import path', async () => {
    const persisted = new Map<string, string>();
    const set = vi.fn(async (key: string, value: string) => {
      persisted.set(key, value);
    });
    const get = vi.fn(async (key: string) => persisted.get(key) ?? null);
    const remove = vi.fn(async (key: string) => {
      persisted.delete(key);
    });

    const storage = await loadOrderSessionStorageWithRuntime({
      keychainFactory: () => ({
        get,
        remove,
        set,
      }),
    });

    await storage.persistOrderSessionId('1', 'sess-runtime');
    storage.__clearOrderSessionStorageMirrorForTests();

    await expect(storage.readPersistedOrderSessionId('1')).resolves.toBe('sess-runtime');
    expect(set).toHaveBeenCalledWith('fixyz.order-session-id:1', 'sess-runtime');
    expect(get).toHaveBeenCalledWith('fixyz.order-session-id:1');

    await storage.clearPersistedOrderSessionId('1');
    storage.__clearOrderSessionStorageMirrorForTests();

    await expect(storage.readPersistedOrderSessionId('1')).resolves.toBeNull();
    expect(remove).toHaveBeenCalledWith('fixyz.order-session-id:1');
  });

  it('surfaces a deterministic initialization error when the real keychain module cannot load', async () => {
    const storage = await loadOrderSessionStorageWithRuntime({
      secureStoreModuleThrows: true,
    });

    await expect(storage.readPersistedOrderSessionId('1')).rejects.toMatchObject({
      code: 'MOB-ORD-001',
      name: 'OrderSessionStorageError',
    });
  });
});
