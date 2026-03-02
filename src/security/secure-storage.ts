export enum SecretClassification {
  ForbiddenPersistence = 'FORBIDDEN_PERSISTENCE',
  ConditionalSecureStorageOnly = 'CONDITIONAL_SECURE_STORAGE_ONLY',
  AllowedNonSensitive = 'ALLOWED_NON_SENSITIVE',
}

export class SecureStoragePolicyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'SecureStoragePolicyError';
    this.code = code;
  }
}

export interface SecureStorage {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  remove(key: string): Promise<void>;
}

export class InMemorySecureStorage implements SecureStorage {
  private readonly storage = new Map<string, string>();

  async set(key: string, value: string): Promise<void> {
    this.storage.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.storage.get(key) ?? null;
  }

  async remove(key: string): Promise<void> {
    this.storage.delete(key);
  }
}

export class SecureSecretStore {
  private readonly secureStorage: SecureStorage;

  constructor(secureStorage: SecureStorage) {
    this.secureStorage = secureStorage;
  }

  async set(
    key: string,
    value: string,
    classification: SecretClassification,
  ): Promise<void> {
    if (classification === SecretClassification.ForbiddenPersistence) {
      throw new SecureStoragePolicyError(
        'MOB-SEC-001',
        'Forbidden secret classes (password/OTP/session/CSRF raw values) cannot be persisted',
      );
    }

    await this.secureStorage.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.secureStorage.get(key);
  }

  async remove(key: string): Promise<void> {
    await this.secureStorage.remove(key);
  }
}
