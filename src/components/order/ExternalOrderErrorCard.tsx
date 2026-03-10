import { Text, View } from 'react-native';

import { palette } from '../auth/auth-styles';
import type { ExternalOrderErrorPresentation } from '../../order/external-errors';

interface ExternalOrderErrorCardProps {
  presentation: ExternalOrderErrorPresentation;
}

const toneBySeverity = {
  info: {
    backgroundColor: palette.infoSoft,
    borderColor: '#BFD6FF',
  },
  warning: {
    backgroundColor: '#FFF4E8',
    borderColor: '#F6B27F',
  },
  error: {
    backgroundColor: palette.dangerSoft,
    borderColor: '#F2A8A1',
  },
} as const;

export const ExternalOrderErrorCard = ({
  presentation,
}: ExternalOrderErrorCardProps) => {
  const tone = toneBySeverity[presentation.severity];
  const badge = presentation.code ?? presentation.operatorCode ?? 'EXTERNAL';

  return (
    <View
      style={{
        borderRadius: 22,
        borderWidth: 1,
        borderColor: tone.borderColor,
        backgroundColor: tone.backgroundColor,
        paddingHorizontal: 16,
        paddingVertical: 16,
        gap: 8,
      }}
      testID="external-order-error-card"
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: palette.inkSoft,
            letterSpacing: 0.4,
          }}
        >
          EXTERNAL ORDER STATUS
        </Text>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '800',
            color: palette.ink,
            backgroundColor: 'rgba(15,23,42,0.08)',
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 999,
          }}
          testID="external-order-error-code"
        >
          {badge}
        </Text>
      </View>
      <Text
        style={{
          fontSize: 18,
          lineHeight: 24,
          fontWeight: '800',
          color: palette.ink,
        }}
        testID="external-order-error-title"
      >
        {presentation.title}
      </Text>
      <Text
        style={{
          fontSize: 14,
          lineHeight: 20,
          color: palette.ink,
        }}
        testID="external-order-error-message"
      >
        {presentation.message}
      </Text>
      <Text
        style={{
          fontSize: 14,
          lineHeight: 20,
          color: palette.inkSoft,
        }}
        testID="external-order-error-next-step"
      >
        {presentation.nextStep}
      </Text>
      {presentation.supportReference ? (
        <Text
          style={{
            fontSize: 13,
            lineHeight: 18,
            fontWeight: '700',
            color: palette.ink,
          }}
          testID="external-order-error-support-reference"
        >
          {presentation.supportReference}
        </Text>
      ) : null}
    </View>
  );
};
