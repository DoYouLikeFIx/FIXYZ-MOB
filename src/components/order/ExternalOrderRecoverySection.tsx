import { Pressable, Text, View } from 'react-native';

import { palette } from '../auth/auth-styles';
import type {
  ExternalOrderPresetId,
  ExternalOrderPresetOption,
} from '../../order/external-order-recovery';
import type { ExternalOrderErrorPresentation } from '../../order/external-errors';
import { ExternalOrderErrorCard } from './ExternalOrderErrorCard';
import { buildExternalOrderRecoverySectionModel } from './external-order-recovery-section-model';

interface ExternalOrderRecoverySectionProps {
  feedbackMessage: string | null;
  isSubmitting: boolean;
  presentation: ExternalOrderErrorPresentation | null;
  presets: readonly ExternalOrderPresetOption[];
  selectedPresetId: ExternalOrderPresetId;
  onClear: () => void;
  onSelectPreset: (presetId: ExternalOrderPresetId) => void;
  onSubmit: () => void;
}

export const ExternalOrderRecoverySection = ({
  feedbackMessage,
  isSubmitting,
  presentation,
  presets,
  selectedPresetId,
  onClear,
  onSelectPreset,
  onSubmit,
}: ExternalOrderRecoverySectionProps) => {
  const model = buildExternalOrderRecoverySectionModel({
    feedbackMessage,
    isSubmitting,
    presentation,
    presets,
    selectedPresetId,
  });

  return (
    <View
      style={{
        borderRadius: 26,
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 18,
        paddingVertical: 18,
        gap: 14,
        shadowColor: '#0F172A',
        shadowOpacity: 0.08,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 12 },
        elevation: 7,
      }}
    >
      <View style={{ gap: 6 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: palette.accentDeep,
            letterSpacing: 0.4,
          }}
        >
          {model.kicker}
        </Text>
        <Text
          style={{
            fontSize: 20,
            lineHeight: 26,
            fontWeight: '800',
            color: palette.ink,
          }}
        >
          {model.title}
        </Text>
        <Text
          style={{
            fontSize: 14,
            lineHeight: 20,
            color: palette.inkSoft,
          }}
        >
          {model.description}
        </Text>
        <Text
          style={{
            fontSize: 13,
            lineHeight: 18,
            fontWeight: '700',
            color: palette.ink,
          }}
          testID="mobile-external-order-summary"
        >
          {model.selectedSummary}
        </Text>
      </View>

      {model.feedbackMessage ? (
        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: '#E8D9CC',
            backgroundColor: '#FFF8F2',
            paddingHorizontal: 14,
            paddingVertical: 14,
          }}
          testID="mobile-external-order-feedback"
        >
          <Text
            style={{
              fontSize: 14,
              lineHeight: 20,
              color: palette.ink,
            }}
          >
            {model.feedbackMessage}
          </Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {model.scenarios.map((scenario) => (
          <Pressable
            key={scenario.id}
            accessibilityRole="button"
            accessibilityState={{ selected: scenario.isSelected }}
            onPress={() => onSelectPreset(scenario.id)}
            style={{
              minWidth: 70,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: scenario.isSelected ? palette.accent : '#E8D9CC',
              backgroundColor: scenario.isSelected ? palette.accent : '#FFFFFF',
            }}
            testID={scenario.testId}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: '800',
                color: scenario.isSelected ? '#FFFFFF' : palette.inkSoft,
                textAlign: 'center',
              }}
            >
              {scenario.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable
          disabled={model.submitAction.disabled}
          onPress={onSubmit}
          style={{
            flex: 1,
            minHeight: 50,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: model.submitAction.disabled ? '#F7C9A8' : palette.accent,
          }}
          testID={model.submitAction.testId}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: '800',
              color: '#FFFFFF',
            }}
          >
            {model.submitAction.label}
          </Text>
        </Pressable>
        <Pressable
          disabled={model.clearAction.disabled}
          onPress={onClear}
          style={{
            flex: 1,
            minHeight: 50,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: '#E8D9CC',
            backgroundColor: model.clearAction.disabled ? '#F8F1EA' : '#FFFFFF',
          }}
          testID={model.clearAction.testId}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: '800',
              color: palette.ink,
            }}
          >
            {model.clearAction.label}
          </Text>
        </Pressable>
      </View>

      {presentation ? (
        <ExternalOrderErrorCard presentation={presentation} />
      ) : model.emptyStateMessage ? (
        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: '#E8D9CC',
            borderStyle: 'dashed',
            backgroundColor: '#FFFDF9',
            paddingHorizontal: 14,
            paddingVertical: 14,
          }}
          testID="mobile-external-order-empty-state"
        >
          <Text
            style={{
              fontSize: 14,
              lineHeight: 20,
              color: palette.inkSoft,
            }}
          >
            {model.emptyStateMessage}
          </Text>
        </View>
      ) : null}
    </View>
  );
};
