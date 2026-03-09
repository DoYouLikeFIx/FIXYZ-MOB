import {
  InMemorySecureStorage,
  SecretClassification,
  SecureSecretStore,
} from '@/security/secure-storage';

describe('secure persistence policy', () => {
  it('rejects forbidden persistence classes', async () => {
    const store = new SecureSecretStore(new InMemorySecureStorage());

    await expect(
      store.set('password', 'plain-text', SecretClassification.ForbiddenPersistence),
    ).rejects.toMatchObject({ code: 'MOB-SEC-001' });
  });

  it('stores conditional secrets with secure adapter only', async () => {
    const backing = new InMemorySecureStorage();
    const store = new SecureSecretStore(backing);

    await store.set(
      'bootstrap-secret',
      'encrypted-value',
      SecretClassification.ConditionalSecureStorageOnly,
    );

    await expect(backing.get('bootstrap-secret')).resolves.toBe('encrypted-value');
  });
});
