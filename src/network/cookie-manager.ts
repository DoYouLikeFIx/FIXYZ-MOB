export interface CookieValue {
  value?: string;
}

export interface CookieReader {
  get(url: string): Promise<Record<string, CookieValue>>;
}

export class InMemoryCookieManager implements CookieReader {
  private readonly jar = new Map<string, Map<string, string>>();

  setCookie(url: string, key: string, value: string): void {
    const scoped = this.jar.get(url) ?? new Map<string, string>();
    scoped.set(key, value);
    this.jar.set(url, scoped);
  }

  async get(url: string): Promise<Record<string, CookieValue>> {
    const scoped = this.jar.get(url);

    if (!scoped) {
      return {};
    }

    return Array.from(scoped.entries()).reduce<Record<string, CookieValue>>(
      (acc, [name, value]) => {
        acc[name] = { value };
        return acc;
      },
      {},
    );
  }
}
