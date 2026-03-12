export const Pressable = 'Pressable';
export const RefreshControl = 'RefreshControl';
export const SafeAreaView = 'SafeAreaView';
export const ScrollView = 'ScrollView';
export const Text = 'Text';
export const TextInput = 'TextInput';
export const View = 'View';
export const Platform = {
  OS: 'ios',
};

export const Keyboard = {
  addListener: () => ({
    remove: () => {},
  }),
};

export const Linking = {
  addEventListener: () => ({
    remove: () => {},
  }),
  getInitialURL: async () => null,
  openURL: vi.fn(async () => true),
};

export const useWindowDimensions = () => ({
  width: 390,
  height: 844,
  scale: 1,
  fontScale: 1,
});

export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T) => styles,
};
