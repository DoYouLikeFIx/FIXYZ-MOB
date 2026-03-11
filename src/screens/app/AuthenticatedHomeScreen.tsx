import {
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from 'react-native';

import type { AccountApi } from '../../api/account-api';
import type { OrderApi } from '../../api/order-api';
import { useAccountDashboardViewModel } from '../../account/use-account-dashboard-view-model';
import { palette } from '../../components/auth/auth-styles';
import { ExternalOrderRecoverySection } from '../../components/order/ExternalOrderRecoverySection';
import { hasExternalOrderAccountId } from '../../order/external-order-recovery';
import { useExternalOrderViewModel } from '../../order/use-external-order-view-model';
import type { Member } from '../../types/auth';

interface AuthenticatedHomeScreenProps {
  accountApi: AccountApi;
  member: Member;
  orderApi: OrderApi;
  welcomeVariant: 'login' | 'register' | null;
  sessionErrorMessage?: string | null;
  isRefreshingSession: boolean;
  onRefreshSession: () => void;
}

export const AuthenticatedHomeScreen = ({
  accountApi,
  member,
  orderApi,
  welcomeVariant,
  sessionErrorMessage,
  isRefreshingSession,
  onRefreshSession,
}: AuthenticatedHomeScreenProps) => {
  const hasOrderAccount = hasExternalOrderAccountId(member.accountId);
  const accountDashboard = useAccountDashboardViewModel({
    accountApi,
    accountId: member.accountId,
  });
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
        refreshControl={(
          <RefreshControl
            refreshing={accountDashboard.isRefreshing}
            onRefresh={accountDashboard.refresh}
            testID="mobile-history-refresh-control"
          />
        )}
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
            계좌 대시보드
          </Text>
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
              대표 계좌
            </Text>
            <Text
              style={{
                fontSize: 20,
                lineHeight: 26,
                fontWeight: '800',
                color: palette.ink,
              }}
              testID="mobile-masked-account"
            >
              {accountDashboard.maskedAccountNumber}
            </Text>
          </View>

          <View
            style={{
              gap: 10,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '700',
                color: palette.inkSoft,
              }}
            >
              백엔드가 반환한 보유 종목 리스트를 그대로 사용해 대표 종목을 구성합니다.
            </Text>

            {!accountDashboard.hasLinkedAccount ? (
              <Text
                style={{
                  fontSize: 12,
                  lineHeight: 18,
                  color: palette.inkSoft,
                }}
                testID="mobile-symbol-unavailable"
              >
                연결된 계좌가 없어 보유 종목 리스트를 불러올 수 없습니다.
              </Text>
            ) : null}

            {accountDashboard.hasLinkedAccount && accountDashboard.symbolOptions.length > 0 ? (
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                {accountDashboard.symbolOptions.map((symbol) => {
                  const isSelected = accountDashboard.selectedSymbol === symbol;

                  return (
                    <Pressable
                      key={symbol}
                      onPress={() => accountDashboard.setSelectedSymbol(symbol)}
                      style={{
                        minHeight: 42,
                        borderRadius: 14,
                        justifyContent: 'center',
                        paddingHorizontal: 14,
                        backgroundColor: isSelected ? '#E8F1FD' : '#FFF6EE',
                        borderWidth: 1,
                        borderColor: isSelected ? '#B7D3F7' : '#F0E5DA',
                      }}
                      testID={`mobile-symbol-${symbol}`}
                    >
                      <Text
                        style={{
                          color: palette.ink,
                          fontWeight: '800',
                        }}
                      >
                        {symbol}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {accountDashboard.hasLinkedAccount
            && !accountDashboard.positionLoading
            && accountDashboard.symbolOptionsError ? (
              <View
                style={{
                  borderRadius: 18,
                  backgroundColor: palette.dangerSoft,
                  paddingHorizontal: 14,
                  paddingVertical: 14,
                  gap: 6,
                }}
                testID="mobile-symbol-error"
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '800',
                    color: palette.danger,
                  }}
                >
                  보유 종목 리스트를 불러오지 못했습니다
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    lineHeight: 20,
                    color: palette.ink,
                  }}
                >
                  {accountDashboard.symbolOptionsError.message}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    lineHeight: 19,
                    color: palette.inkSoft,
                  }}
                >
                  {accountDashboard.symbolOptionsError.nextStep}
                </Text>
                <Pressable
                  onPress={accountDashboard.retryPosition}
                  style={{
                    minHeight: 44,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#FFFFFF',
                  }}
                  testID="mobile-symbol-retry"
                >
                  <Text
                    style={{
                      color: palette.ink,
                      fontWeight: '800',
                    }}
                  >
                    다시 시도
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {accountDashboard.hasLinkedAccount
            && !accountDashboard.positionLoading
            && !accountDashboard.symbolOptionsError
            && accountDashboard.symbolOptions.length === 0 ? (
              <Text
                style={{
                  fontSize: 12,
                  lineHeight: 18,
                  color: palette.inkSoft,
                }}
                testID="mobile-symbol-empty"
              >
                아직 보유 중인 종목이 없습니다.
              </Text>
            ) : null}

            {accountDashboard.selectedSymbol ? (
              <Text
                style={{
                  fontSize: 12,
                  lineHeight: 18,
                  color: palette.inkSoft,
                }}
              >
                현재 조회 종목 {accountDashboard.selectedSymbol}
              </Text>
            ) : null}
          </View>

          {accountDashboard.positionLoading ? (
            <Text
              style={{
                fontSize: 14,
                lineHeight: 20,
                color: palette.inkSoft,
              }}
              testID="mobile-dashboard-loading"
            >
              계좌 요약을 불러오는 중입니다.
            </Text>
          ) : null}

          {!accountDashboard.positionLoading && accountDashboard.positionError ? (
            <View
              style={{
                borderRadius: 18,
                backgroundColor: palette.dangerSoft,
                paddingHorizontal: 14,
                paddingVertical: 14,
                gap: 6,
              }}
              testID="mobile-dashboard-error"
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '800',
                  color: palette.danger,
                }}
              >
                계좌 요약을 불러오지 못했습니다
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  lineHeight: 20,
                  color: palette.ink,
                }}
              >
                {accountDashboard.positionError.message}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  lineHeight: 19,
                  color: palette.inkSoft,
                }}
              >
                {accountDashboard.positionError.nextStep}
              </Text>
              <Pressable
                onPress={accountDashboard.retryPosition}
                style={{
                  minHeight: 44,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#FFFFFF',
                }}
                testID="mobile-dashboard-retry"
              >
                <Text
                  style={{
                    color: palette.ink,
                    fontWeight: '800',
                  }}
                >
                  다시 시도
                </Text>
              </Pressable>
            </View>
          ) : null}

          {!accountDashboard.positionLoading
          && !accountDashboard.positionError
          && !accountDashboard.hasLinkedAccount ? (
            <View
              style={{
                borderRadius: 18,
                backgroundColor: '#FFF6EE',
                paddingHorizontal: 14,
                paddingVertical: 14,
                gap: 6,
              }}
              testID="mobile-dashboard-unavailable"
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '800',
                  color: palette.accentDeep,
                }}
              >
                계좌 요약을 조회할 수 없습니다
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  lineHeight: 20,
                  color: palette.ink,
                }}
              >
                연결된 계좌가 없어 계좌 요약을 불러올 수 없습니다.
              </Text>
            </View>
          ) : null}

          {!accountDashboard.positionLoading
          && !accountDashboard.positionError
          && accountDashboard.hasLinkedAccount
          && accountDashboard.position ? (
            <View
              style={{
                gap: 10,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: palette.inkSoft,
                  }}
                >
                  예수금
                </Text>
                <Text
                  style={{
                    fontSize: 24,
                    fontWeight: '800',
                    color: palette.ink,
                  }}
                  testID="mobile-dashboard-balance"
                >
                  {new Intl.NumberFormat('ko-KR', {
                    style: 'currency',
                    currency: 'KRW',
                    maximumFractionDigits: 0,
                  }).format(accountDashboard.position.balance)}
                </Text>
              </View>

              {[
                ['가용 수량', `${accountDashboard.position.availableQuantity}주`],
                ['보유 수량', `${accountDashboard.position.quantity}주`],
                ...(accountDashboard.position.symbol
                  ? [['조회 종목', accountDashboard.position.symbol] as const]
                  : []),
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
            </View>
          ) : null}

          {!accountDashboard.positionLoading
          && !accountDashboard.positionError
          && accountDashboard.hasLinkedAccount
          && !accountDashboard.position ? (
            <View
              style={{
                borderRadius: 18,
                backgroundColor: '#FFF6EE',
                paddingHorizontal: 14,
                paddingVertical: 14,
                gap: 6,
              }}
              testID="mobile-dashboard-empty"
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '800',
                  color: palette.accentDeep,
                }}
              >
                계좌 요약을 표시할 수 없습니다
              </Text>
              <Text
                style={{
                fontSize: 14,
                lineHeight: 20,
                color: palette.ink,
              }}
            >
                아직 보유 중인 종목이 없어 계좌 요약을 표시할 수 없습니다.
              </Text>
            </View>
          ) : null}
        </View>

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
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <View>
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: '800',
                  color: palette.ink,
                }}
              >
                최근 주문 이력
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  lineHeight: 19,
                  color: palette.inkSoft,
                  marginTop: 4,
                }}
              >
                최신 5건을 서버 기준으로 다시 불러옵니다.
              </Text>
            </View>
            <Text
              style={{
                fontSize: 13,
                fontWeight: '700',
                color: palette.inkSoft,
              }}
            >
              {accountDashboard.historyTotalElements}건
            </Text>
          </View>

          {accountDashboard.historyLoading ? (
            <Text
              style={{
                fontSize: 14,
                lineHeight: 20,
                color: palette.inkSoft,
              }}
              testID="mobile-history-loading"
            >
              주문 내역을 조회하는 중입니다.
            </Text>
          ) : null}

          {!accountDashboard.historyLoading && !accountDashboard.hasLinkedAccount ? (
            <View
              style={{
                borderRadius: 18,
                backgroundColor: '#FFF6EE',
                paddingHorizontal: 14,
                paddingVertical: 14,
                gap: 6,
              }}
              testID="mobile-history-unavailable"
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '800',
                  color: palette.accentDeep,
                }}
              >
                주문 내역을 조회할 수 없습니다
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  lineHeight: 20,
                  color: palette.ink,
                }}
              >
                연결된 계좌가 없어 주문 내역을 조회할 수 없습니다.
              </Text>
            </View>
          ) : null}

          {!accountDashboard.historyLoading
          && accountDashboard.hasLinkedAccount
          && accountDashboard.historyError ? (
            <View
              style={{
                borderRadius: 18,
                backgroundColor: palette.dangerSoft,
                paddingHorizontal: 14,
                paddingVertical: 14,
                gap: 6,
              }}
              testID="mobile-history-error"
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '800',
                  color: palette.danger,
                }}
              >
                주문 내역을 불러오지 못했습니다
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  lineHeight: 20,
                  color: palette.ink,
                }}
              >
                {accountDashboard.historyError.message}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  lineHeight: 19,
                  color: palette.inkSoft,
                }}
              >
                {accountDashboard.historyError.nextStep}
              </Text>
              <Pressable
                onPress={accountDashboard.retryHistory}
                style={{
                  minHeight: 44,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#FFFFFF',
                }}
                testID="mobile-history-retry"
              >
                <Text
                  style={{
                    color: palette.ink,
                    fontWeight: '800',
                  }}
                >
                  다시 시도
                </Text>
              </Pressable>
            </View>
          ) : null}

          {!accountDashboard.historyLoading
          && accountDashboard.hasLinkedAccount
          && !accountDashboard.historyError
          && accountDashboard.historyItems.length === 0 ? (
            <Text
              style={{
                fontSize: 14,
                lineHeight: 20,
                color: palette.inkSoft,
              }}
              testID="mobile-history-empty"
            >
              아직 주문 내역이 없습니다.
            </Text>
          ) : null}

          {!accountDashboard.historyLoading
          && accountDashboard.hasLinkedAccount
          && !accountDashboard.historyError
          && accountDashboard.historyItems.length > 0 ? (
            <View
              style={{
                gap: 10,
              }}
              testID="mobile-history-list"
            >
              {accountDashboard.historyItems.map((item) => (
                <View
                  key={item.clOrdId}
                  style={{
                    borderRadius: 18,
                    backgroundColor: '#F7F3EF',
                    paddingHorizontal: 14,
                    paddingVertical: 14,
                    gap: 4,
                  }}
                  testID={`mobile-history-row-${item.clOrdId}`}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '800',
                      color: palette.ink,
                    }}
                  >
                    {item.symbolName} · {item.side}
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      lineHeight: 19,
                      color: palette.inkSoft,
                    }}
                  >
                    {item.symbol} / {item.qty}주 / {item.status}
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      lineHeight: 19,
                      color: palette.inkSoft,
                    }}
                  >
                    {new Intl.NumberFormat('ko-KR', {
                      style: 'currency',
                      currency: 'KRW',
                      maximumFractionDigits: 0,
                    }).format(item.totalAmount)}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      lineHeight: 18,
                      color: palette.inkSoft,
                    }}
                  >
                    주문 ID {item.clOrdId}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

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
