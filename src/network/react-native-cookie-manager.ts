import CookieManager from '@react-native-cookies/cookies';

import type { CookieReader, CookieValue } from './cookie-manager';

export class ReactNativeCookieReader implements CookieReader {
  async get(url: string): Promise<Record<string, CookieValue>> {
    const cookies = await CookieManager.get(url);

    return Object.entries(cookies).reduce<Record<string, CookieValue>>(
      (acc, [name, cookie]) => {
        acc[name] = { value: cookie.value };
        return acc;
      },
      {},
    );
  }
}
