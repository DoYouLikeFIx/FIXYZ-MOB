import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const srcRoot = resolve(mobRoot, 'src');

const REQUIRED_ROOTS = [
  'src/auth',
  'src/navigation',
  'src/screens/auth',
  'src/screens/app',
  'src/store',
  'src/network',
  'src/security',
  'tests/unit',
  'tests/integration',
  'tests/e2e',
  'tests/collab-webhook',
  'tests/supply-chain',
  'e2e',
] as const;

const normalize = (targetPath: string) =>
  relative(mobRoot, targetPath).split(sep).join('/');

const collectFiles = (dir: string): string[] => {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      return collectFiles(entryPath);
    }
    return entry.isFile() ? [entryPath] : [];
  });
};

describe('mobile structure conventions', () => {
  it('keeps the required mobile roots in place', () => {
    const missing = REQUIRED_ROOTS.filter((rootPath) => !existsSync(resolve(mobRoot, rootPath)));

    expect(missing).toEqual([]);
  });

  it('keeps production source free of colocated test files', () => {
    const offendingFiles = collectFiles(srcRoot)
      .filter((filePath) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(filePath))
      .map(normalize);

    expect(offendingFiles).toEqual([]);
    expect(existsSync(resolve(srcRoot, 'test'))).toBe(false);
    expect(existsSync(resolve(mobRoot, 'test'))).toBe(false);
  });

  it('keeps App.tsx focused on runtime wiring and navigator composition', () => {
    const appSource = readFileSync(resolve(mobRoot, 'App.tsx'), 'utf8');

    expect(appSource).toContain('createMobileAuthRuntime');
    expect(appSource).toContain('useAuthFlowViewModel');
    expect(appSource).toContain('<AppNavigator');
    expect(appSource).not.toMatch(/\.\/src\/screens\//);
    expect(appSource).not.toMatch(/\.\/src\/api\//);
    expect(appSource).not.toMatch(/\.\/src\/network\//);
  });

  it('prevents screens from reaching into api, network, store, or service layers directly', () => {
    const offendingScreens = collectFiles(resolve(srcRoot, 'screens'))
      .filter((filePath) => /\.tsx$/.test(filePath))
      .filter((filePath) => {
        const source = readFileSync(filePath, 'utf8');
        return /^import\s+(?!type\b).*mobile-auth-service/m.test(source)
          || /^import\s+(?!type\b).*auth-api/m.test(source)
          || /^import\s+(?!type\b).*from ['"][.]{1,2}\/[.]{1,2}\/api\//m.test(source)
          || /^import\s+(?!type\b).*from ['"][.]{1,2}\/[.]{1,2}\/network\//m.test(source)
          || /^import\s+(?!type\b).*from ['"][.]{1,2}\/[.]{1,2}\/store\//m.test(source);
      })
      .map(normalize)
      .sort();

    expect(offendingScreens).toEqual([]);
  });

  it('keeps secret storage on the secure-storage boundary instead of AsyncStorage', () => {
    const asyncStorageOwners = collectFiles(srcRoot)
      .filter((filePath) => /\.(ts|tsx)$/.test(filePath))
      .filter((filePath) =>
        /@react-native-async-storage\/async-storage|AsyncStorage/.test(
          readFileSync(filePath, 'utf8'),
        ),
      )
      .map(normalize)
      .sort();

    expect(asyncStorageOwners).toEqual([]);
  });

  it('keeps auth-store on useSyncExternalStore as documented', () => {
    const authStoreSource = readFileSync(resolve(srcRoot, 'store/auth-store.ts'), 'utf8');

    expect(authStoreSource).toContain('useSyncExternalStore');
  });
});
