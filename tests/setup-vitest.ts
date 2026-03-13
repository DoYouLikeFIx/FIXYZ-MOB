Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
});

vi.mock('react-native-launch-arguments', () => ({
  LaunchArguments: {
    value: () => ({}),
  },
}));

const originalConsoleError = console.error.bind(console);
let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeAll(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
    const [firstArg] = args;

    if (
      typeof firstArg === 'string'
      && firstArg.includes('react-test-renderer is deprecated')
    ) {
      return;
    }

    originalConsoleError(...args);
  });
});

afterAll(() => {
  consoleErrorSpy?.mockRestore();
});
