import { ActivityIndicator, SafeAreaView, Text, View } from 'react-native';

import {
  authSharedStyles as styles,
  palette,
} from '../../components/auth/auth-styles';

export const BootScreen = () => (
  <SafeAreaView style={styles.screen}>
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 28,
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: 360,
          borderRadius: 28,
          backgroundColor: palette.surface,
          paddingHorizontal: 24,
          paddingVertical: 28,
          gap: 14,
          alignItems: 'center',
          shadowColor: '#0F172A',
          shadowOpacity: 0.08,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 12 },
          elevation: 8,
        }}
      >
        <ActivityIndicator color={palette.accent} size="large" />
        <Text
          style={{
            fontSize: 20,
            fontWeight: '800',
            color: palette.ink,
            textAlign: 'center',
          }}
        >
          보안 세션을 확인하고 있습니다
        </Text>
        <Text
          style={{
            fontSize: 14,
            lineHeight: 21,
            color: palette.inkSoft,
            textAlign: 'center',
          }}
        >
          앱 복귀와 세션 만료 상황에서도 동일한 인증 규칙을 적용하기 위해 서버 상태를 먼저
          재검증합니다.
        </Text>
      </View>
    </View>
  </SafeAreaView>
);
