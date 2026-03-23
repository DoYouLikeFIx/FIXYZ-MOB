import { Text, View } from 'react-native';

import type { AccountPosition, QuoteSourceMode } from '../../types/account';
import { formatKRW } from '../../utils/formatters';

const quoteDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

type QuoteTone = {
  accent: string;
  accentSoft: string;
  badgeBorder: string;
  boardBackground: string;
  boardBorder: string;
  panelSurface: string;
  stateLabel: string;
  statusFill: string;
  statusNote: string;
  statusText: string;
};

const getQuoteTone = (quoteSourceMode: QuoteSourceMode | null | undefined): QuoteTone => {
  switch (quoteSourceMode) {
    case 'LIVE':
      return {
        accent: '#FF8A3D',
        accentSoft: 'rgba(255, 138, 61, 0.14)',
        badgeBorder: 'rgba(255, 138, 61, 0.26)',
        boardBackground: '#0B1018',
        boardBorder: 'rgba(255,255,255,0.08)',
        panelSurface: '#101722',
        stateLabel: '직결 시세',
        statusFill: 'rgba(255, 138, 61, 0.18)',
        statusNote: '실시간 기준',
        statusText: '#FFB07A',
      };
    case 'DELAYED':
      return {
        accent: '#F6B84A',
        accentSoft: 'rgba(246, 184, 74, 0.14)',
        badgeBorder: 'rgba(246, 184, 74, 0.28)',
        boardBackground: '#0B1018',
        boardBorder: 'rgba(255,255,255,0.08)',
        panelSurface: '#101722',
        stateLabel: '지연 호가',
        statusFill: 'rgba(246, 184, 74, 0.18)',
        statusNote: '지연 도착 데이터',
        statusText: '#FFD27E',
      };
    case 'REPLAY':
      return {
        accent: '#72A9FF',
        accentSoft: 'rgba(114, 169, 255, 0.14)',
        badgeBorder: 'rgba(114, 169, 255, 0.26)',
        boardBackground: '#0B1018',
        boardBorder: 'rgba(255,255,255,0.08)',
        panelSurface: '#101722',
        stateLabel: '리플레이 기준',
        statusFill: 'rgba(114, 169, 255, 0.18)',
        statusNote: '재생 스냅샷',
        statusText: '#A9CBFF',
      };
    default:
      return {
        accent: '#A7B2C6',
        accentSoft: 'rgba(167, 178, 198, 0.14)',
        badgeBorder: 'rgba(167, 178, 198, 0.24)',
        boardBackground: '#0B1018',
        boardBorder: 'rgba(255,255,255,0.08)',
        panelSurface: '#101722',
        stateLabel: '미확인 시세',
        statusFill: 'rgba(167, 178, 198, 0.16)',
        statusNote: '새 source mode',
        statusText: '#D4DBE8',
      };
  }
};

const formatModeLabel = (quoteSourceMode: QuoteSourceMode | null | undefined) => {
  const normalized = typeof quoteSourceMode === 'string' ? quoteSourceMode.trim() : '';
  return normalized || 'UNKNOWN';
};

const formatTimestampLabel = (value: string | null | undefined) => {
  if (!value) {
    return '시각 확인 필요';
  }

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return '시각 확인 필요';
  }

  return quoteDateFormatter.format(new Date(timestamp));
};

const formatFreshnessAge = (quoteAsOf: string, asOf: string) => {
  const quoteTime = new Date(quoteAsOf).getTime();
  const asOfTime = new Date(asOf).getTime();

  if (!Number.isFinite(quoteTime) || !Number.isFinite(asOfTime)) {
    return '시각 확인 필요';
  }

  const deltaMs = Math.abs(asOfTime - quoteTime);

  if (deltaMs < 60_000) {
    return '동일 시각';
  }

  const deltaMinutes = Math.round(deltaMs / 60_000);

  if (deltaMinutes < 60) {
    return `${deltaMinutes}분 차이`;
  }

  const hours = Math.floor(deltaMinutes / 60);
  const minutes = deltaMinutes % 60;

  return minutes > 0
    ? `${hours}시간 ${minutes}분 차이`
    : `${hours}시간 차이`;
};

interface DashboardQuoteTickerProps {
  position: AccountPosition;
}

const MetaChip = ({
  label,
  value,
  valueTestID,
}: {
  label: string;
  value: string;
  valueTestID?: string;
}) => (
  <View
    style={{
      minWidth: 110,
      gap: 3,
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingVertical: 9,
      backgroundColor: 'rgba(255,255,255,0.05)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.06)',
    }}
  >
    <Text
      style={{
        fontSize: 10,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.46)',
      }}
    >
      {label}
    </Text>
    <Text
      style={{
        fontSize: 12,
        fontWeight: '700',
        color: '#F6F8FC',
        fontVariant: ['tabular-nums'],
      }}
      testID={valueTestID}
    >
      {value}
    </Text>
  </View>
);

const SignalCard = ({
  helper,
  label,
  value,
  valueTestID,
}: {
  helper: string;
  label: string;
  value: string;
  valueTestID?: string;
}) => (
  <View
    style={{
      flexGrow: 1,
      minWidth: 150,
      gap: 4,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 12,
      backgroundColor: 'rgba(255,255,255,0.03)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.06)',
    }}
  >
    <Text
      style={{
        fontSize: 10,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.46)',
      }}
    >
      {label}
    </Text>
    <Text
      style={{
        fontSize: 15,
        fontWeight: '800',
        color: '#F6F8FC',
        fontVariant: ['tabular-nums'],
      }}
      testID={valueTestID}
    >
      {value}
    </Text>
    <Text
      style={{
        fontSize: 11,
        lineHeight: 16,
        color: 'rgba(255,255,255,0.5)',
      }}
    >
      {helper}
    </Text>
  </View>
);

export const DashboardQuoteTicker = ({ position }: DashboardQuoteTickerProps) => {
  if (
    position.marketPrice === null
    || position.marketPrice === undefined
    || !position.quoteAsOf
    || !position.quoteSourceMode
  ) {
    return null;
  }

  const quoteTone = getQuoteTone(position.quoteSourceMode);
  const modeLabel = formatModeLabel(position.quoteSourceMode);
  const freshnessAge = formatFreshnessAge(position.quoteAsOf, position.asOf);
  const quoteAsOfLabel = formatTimestampLabel(position.quoteAsOf);
  const asOfLabel = formatTimestampLabel(position.asOf);

  return (
    <View
      style={{
        gap: 12,
        borderRadius: 24,
        paddingHorizontal: 14,
        paddingVertical: 14,
        backgroundColor: quoteTone.boardBackground,
        borderWidth: 1,
        borderColor: quoteTone.boardBorder,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.22,
        shadowRadius: 18,
      }}
      testID="mobile-dashboard-quote-ticker"
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <View style={{ gap: 2 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '800',
              letterSpacing: 0.8,
              color: 'rgba(255,255,255,0.52)',
              textTransform: 'uppercase',
            }}
          >
            Quote Board
          </Text>
          <Text
            style={{
              fontSize: 12,
              fontWeight: '700',
              color: '#F6F8FC',
            }}
          >
            시장가 확인용 freshness 패널
          </Text>
        </View>

        <View
          style={{
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 6,
            backgroundColor: quoteTone.accentSoft,
            borderWidth: 1,
            borderColor: quoteTone.badgeBorder,
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontWeight: '800',
              letterSpacing: 0.5,
              color: quoteTone.accent,
              textTransform: 'uppercase',
            }}
          >
            Snapshot
          </Text>
        </View>
      </View>

      <View
        style={{
          gap: 14,
          borderRadius: 20,
          paddingHorizontal: 14,
          paddingVertical: 14,
          backgroundColor: quoteTone.panelSurface,
          borderWidth: 1,
          borderColor: quoteTone.boardBorder,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <View style={{ flex: 1, gap: 10 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: '900',
                  letterSpacing: 0.6,
                  color: '#F7FAFF',
                }}
                testID="mobile-dashboard-quote-ticker-symbol"
              >
                {position.symbol}
              </Text>
              <View
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  backgroundColor: 'rgba(255,255,255,0.08)',
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '800',
                    color: 'rgba(255,255,255,0.76)',
                  }}
                >
                  KRX
                </Text>
              </View>
              <View
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  backgroundColor: quoteTone.statusFill,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '800',
                    color: quoteTone.statusText,
                  }}
                  testID="mobile-dashboard-quote-ticker-state"
                >
                  {quoteTone.stateLabel}
                </Text>
              </View>
            </View>

            <View style={{ gap: 5 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: 'rgba(255,255,255,0.46)',
                }}
              >
                현재가
              </Text>
              <Text
                style={{
                  fontSize: 34,
                  fontWeight: '900',
                  lineHeight: 38,
                  color: '#F7FAFF',
                  fontVariant: ['tabular-nums'],
                }}
                testID="mobile-dashboard-quote-ticker-price"
              >
                {formatKRW(position.marketPrice)}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: 'rgba(255,255,255,0.58)',
                }}
              >
                호가 기준 {quoteAsOfLabel}
              </Text>
            </View>
          </View>

          <View
            style={{
              alignItems: 'flex-end',
              gap: 8,
              flexShrink: 0,
            }}
          >
            <View
              style={{
                borderRadius: 999,
                paddingHorizontal: 11,
                paddingVertical: 6,
                backgroundColor: quoteTone.accentSoft,
                borderWidth: 1,
                borderColor: quoteTone.badgeBorder,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '900',
                  letterSpacing: 0.3,
                  color: quoteTone.accent,
                }}
                testID="mobile-dashboard-quote-ticker-mode"
              >
                {modeLabel}
              </Text>
            </View>

            <Text
              style={{
                fontSize: 10,
                fontWeight: '700',
                color: 'rgba(255,255,255,0.44)',
              }}
              testID="mobile-dashboard-quote-ticker-status-note"
            >
              {quoteTone.statusNote}
            </Text>
          </View>
        </View>

        <View
          style={{
            gap: 10,
          }}
          testID="mobile-dashboard-quote-ticker-chart"
        >
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <SignalCard
              label="시각 차이"
              value={freshnessAge}
              valueTestID="mobile-dashboard-quote-ticker-freshness-age"
              helper="quoteAsOf 대비 조회 기준 차이"
            />
            <SignalCard
              label="Source 해석"
              value={quoteTone.statusNote}
              helper="backend source mode를 그대로 보여줍니다."
            />
            <SignalCard
              label="표시 원칙"
              value="히스토리 차트 미사용"
              helper="실제 가격 흐름을 합성하지 않습니다."
            />
          </View>

          <Text
            style={{
              fontSize: 11,
              lineHeight: 17,
              color: 'rgba(255,255,255,0.42)',
            }}
          >
            서버가 내려준 quote freshness 메타데이터만 요약합니다.
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <MetaChip
            label="호가 기준"
            value={quoteAsOfLabel}
            valueTestID="mobile-dashboard-quote-ticker-quote-as-of"
          />
          <MetaChip
            label="Snapshot"
            value={position.quoteSnapshotId ?? 'pending'}
            valueTestID="mobile-dashboard-quote-ticker-snapshot"
          />
          <MetaChip
            label="조회 기준"
            value={asOfLabel}
          />
          <MetaChip
            label="데이터 상태"
            value={quoteTone.stateLabel}
          />
        </View>
      </View>
    </View>
  );
};
