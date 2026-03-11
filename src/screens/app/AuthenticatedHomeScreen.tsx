import { Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';

import type { OrderApi } from '../../api/order-api';
import { palette } from '../../components/auth/auth-styles';
import { ExternalOrderRecoverySection } from '../../components/order/ExternalOrderRecoverySection';
import { hasExternalOrderAccountId } from '../../order/external-order-recovery';
import { useExternalOrderViewModel } from '../../order/use-external-order-view-model';
import type { Member } from '../../types/auth';

interface AuthenticatedHomeScreenProps {
  member: Member;
  orderApi: OrderApi;
  welcomeVariant: 'login' | 'register' | null;
  sessionErrorMessage?: string | null;
  isRefreshingSession: boolean;
  onRefreshSession: () => void;
}

export const AuthenticatedHomeScreen = ({
  member,
  orderApi,
  welcomeVariant,
  sessionErrorMessage,
  isRefreshingSession,
  onRefreshSession,
}: AuthenticatedHomeScreenProps) => {
  const hasOrderAccount = hasExternalOrderAccountId(member.accountId);
  const externalOrderViewModel = useExternalOrderViewModel({
    accountId: member.accountId,
    orderApi,
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9F5F1' }}>
      <ScrollView
        bounces={false}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingVertical: 18,
          gap: 18,
        }}
      >
        <View
          style={{
            borderRadius: 32,
            overflow: 'hidden',
            paddingHorizontal: 22,
            paddingVertical: 24,
            backgroundColor: palette.accent,
            shadowColor: '#FF7A1A',
            shadowOpacity: 0.28,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 14 },
            elevation: 8,
          }}
        >
          <View
            style={{
              position: 'absolute',
              top: -48,
              right: -8,
              width: 156,
              height: 156,
              borderRadius: 78,
              backgroundColor: 'rgba(255,255,255,0.18)',
            }}
          />
          <Text
            style={{
              fontSize: 13,
              fontWeight: '700',
              color: 'rgba(255,255,255,0.88)',
              marginBottom: 12,
            }}
          >
            AUTHENTICATED STACK
          </Text>
          <Text
            style={{
              fontSize: 30,
              lineHeight: 36,
              fontWeight: '800',
              color: '#FFFFFF',
            }}
            testID="protected-area-title"
          >
            {member.name}님, 보호된 영역에 접근했습니다
          </Text>
          <Text
            style={{
              marginTop: 10,
              fontSize: 15,
              lineHeight: 22,
              color: 'rgba(255,255,255,0.88)',
            }}
          >
            만료된 세션, 앱 재개, 서버 재인증 요구가 모두 동일한 규칙으로 처리되는 모바일 인증
            스택입니다.
          </Text>
        </View>

        {welcomeVariant === 'register' ? (
          <View
            style={{
              borderRadius: 22,
              backgroundColor: palette.successSoft,
              paddingHorizontal: 16,
              paddingVertical: 15,
              gap: 4,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '700',
                color: palette.success,
              }}
            >
              가입 완료
            </Text>
            <Text
              style={{
                fontSize: 14,
                lineHeight: 20,
                color: palette.ink,
              }}
            >
              회원 가입이 완료되었습니다. 서버 세션이 유효한 상태로 바로 보호된 앱 스택에
              진입했습니다.
            </Text>
          </View>
        ) : null}

        {sessionErrorMessage ? (
          <View
            style={{
              borderRadius: 22,
              backgroundColor: palette.dangerSoft,
              paddingHorizontal: 16,
              paddingVertical: 15,
              gap: 4,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '700',
                color: palette.danger,
              }}
            >
              세션 확인 실패
            </Text>
            <Text
              style={{
                fontSize: 14,
                lineHeight: 20,
                color: palette.ink,
              }}
            >
              {sessionErrorMessage}
            </Text>
          </View>
        ) : null}

        <View
          style={{
            borderRadius: 26,
            backgroundColor: '#FFFFFF',
            paddingHorizontal: 18,
            paddingVertical: 18,
            gap: 16,
            shadowColor: '#0F172A',
            shadowOpacity: 0.08,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 12 },
            elevation: 7,
          }}
        >
          <Text
            style={{
              fontSize: 17,
              fontWeight: '800',
              color: palette.ink,
            }}
          >
            현재 세션 상태
          </Text>
          {[
            ['이메일', member.email],
            ['권한', member.role],
            ['TOTP 등록', member.totpEnrolled ? '완료' : '미등록'],
          ].map(([label, value]) => (
            <View
              key={label}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: 10,
                borderBottomWidth: 1,
                borderBottomColor: '#F0E5DA',
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: palette.inkSoft,
                }}
              >
                {label}
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: palette.ink,
                }}
              >
                {value}
              </Text>
            </View>
          ))}
          <View
            style={{
              borderRadius: 18,
              backgroundColor: '#FFF6EE',
              paddingHorizontal: 14,
              paddingVertical: 14,
              gap: 6,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: palette.accentDeep,
                letterSpacing: 0.4,
              }}
            >
              ORDER BOUNDARY
            </Text>
            <Text
              style={{
                fontSize: 14,
                lineHeight: 20,
                color: palette.ink,
              }}
            >
              실제 `/api/v1/orders` 응답에서 FEP 오류가 수신되면 아래 카드가 재시도, 대기,
              문의 안내를 같은 의미로 보여줍니다.
            </Text>
          </View>
          <Text
            style={{
              fontSize: 13,
              lineHeight: 20,
              color: palette.inkSoft,
            }}
          >
            앱이 백그라운드에서 돌아오면 같은 세션 검증이 자동으로 다시 실행되고, 서버가
            재인증을 요구하면 즉시 로그인 플로우로 복귀합니다.
          </Text>
          <Pressable
            disabled={isRefreshingSession}
            onPress={onRefreshSession}
            style={{
              minHeight: 52,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isRefreshingSession ? '#F7C9A8' : palette.accent,
            }}
            testID="session-refresh-button"
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: '800',
                color: '#FFFFFF',
              }}
            >
              {isRefreshingSession ? '세션 확인 중...' : '세션 다시 확인'}
            </Text>
          </Pressable>
        </View>

        {hasOrderAccount ? (
          <ExternalOrderRecoverySection
            feedbackMessage={externalOrderViewModel.feedbackMessage}
            isSubmitting={externalOrderViewModel.isSubmitting}
            presentation={externalOrderViewModel.presentation}
            presets={externalOrderViewModel.presets}
            selectedPresetId={externalOrderViewModel.selectedPresetId}
            onClear={externalOrderViewModel.clear}
            onSelectPreset={externalOrderViewModel.selectPreset}
            onSubmit={externalOrderViewModel.submit}
          />
        ) : (
          <View
            style={{
              borderRadius: 26,
              backgroundColor: '#FFFFFF',
              paddingHorizontal: 18,
              paddingVertical: 18,
              gap: 8,
              shadowColor: '#0F172A',
              shadowOpacity: 0.08,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 12 },
              elevation: 7,
            }}
            testID="mobile-external-order-unavailable"
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: palette.accentDeep,
                letterSpacing: 0.4,
              }}
            >
              ORDER BOUNDARY
            </Text>
            <Text
              style={{
                fontSize: 20,
                lineHeight: 26,
                fontWeight: '800',
                color: palette.ink,
              }}
            >
              주문 계좌 연동 필요
            </Text>
            <Text
              style={{
                fontSize: 14,
                lineHeight: 20,
                color: palette.inkSoft,
              }}
            >
              현재 세션에는 `/api/v1/orders`에 전달할 주문 계좌 ID가 없습니다. 계좌 연동이
              완료된 사용자에게만 주문 경계를 활성화합니다.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};
