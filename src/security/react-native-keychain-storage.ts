import * as Keychain from 'react-native-keychain';

import type { SecureStorage } from './secure-storage';

export class ReactNativeKeychainStorage implements SecureStorage {
  async set(key: string, value: string): Promise<void> {
    await Keychain.setGenericPassword(key, value, {
      service: key,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  async get(key: string): Promise<string | null> {
    const credentials = await Keychain.getGenericPassword({ service: key });

    if (!credentials) {
      return null;
    }

    return credentials.password;
  }

  async remove(key: string): Promise<void> {
    await Keychain.resetGenericPassword({ service: key });
  }
}
