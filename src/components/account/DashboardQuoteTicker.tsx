import { Text, View } from 'react-native';

import type { AccountPosition, QuoteSourceMode } from '../../types/account';
import { formatKRW } from '../../utils/formatters';

const quoteDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const PREVIEW_CANDLE_COUNT = 18;
const CHART_HEIGHT = 152;

interface PreviewCandle {
  open: number;
  close: number;
  high: number;
  low: number;
}

const normalizePrice = (value: number) => Math.max(10, Math.round(value / 10) * 10);

const hashKey = (input: string) =>
  input.split('').reduce((accumulator, character) => (
    (accumulator * 31 + character.charCodeAt(0)) % 2_147_483_647
  ), 7);

const createSeededRandom = (seed: number) => {
  let value = seed % 2_147_483_647;

  if (value <= 0) {
    value += 2_147_483_646;
  }

  return () => {
    value = (value * 16_807) % 2_147_483_647;
    return (value - 1) / 2_147_483_646;
  };
};

const getChartTone = (quoteSourceMode: QuoteSourceMode | null | undefined) => {
  switch (quoteSourceMode) {
    case 'DELAYED':
      return {
        accent: '#F6B84A',
        accentSoft: 'rgba(246, 184, 74, 0.14)',
        badgeBorder: 'rgba(246, 184, 74, 0.28)',
        boardBackground: '#0B1018',
        boardBorder: 'rgba(255,255,255,0.08)',
        chartSurface: '#101722',
        gridColor: 'rgba(246, 184, 74, 0.12)',
        priceGuide: 'rgba(246, 184, 74, 0.34)',
        scaleSurface: '#151D2A',
        stateLabel: '지연 호가',
        statusFill: 'rgba(246, 184, 74, 0.18)',
        statusText: '#FFD27E',
        volatilityRatio: 0.0036,
      } as const;
    case 'REPLAY':
      return {
        accent: '#72A9FF',
        accentSoft: 'rgba(114, 169, 255, 0.14)',
        badgeBorder: 'rgba(114, 169, 255, 0.26)',
        boardBackground: '#0B1018',
        boardBorder: 'rgba(255,255,255,0.08)',
        chartSurface: '#101722',
        gridColor: 'rgba(114, 169, 255, 0.12)',
        priceGuide: 'rgba(114, 169, 255, 0.34)',
        scaleSurface: '#151D2A',
        stateLabel: '리플레이 기준',
        statusFill: 'rgba(114, 169, 255, 0.18)',
        statusText: '#A9CBFF',
        volatilityRatio: 0.0028,
      } as const;
    case 'LIVE':
    default:
      return {
        accent: '#FF8A3D',
        accentSoft: 'rgba(255, 138, 61, 0.14)',
        badgeBorder: 'rgba(255, 138, 61, 0.26)',
        boardBackground: '#0B1018',
        boardBorder: 'rgba(255,255,255,0.08)',
        chartSurface: '#101722',
        gridColor: 'rgba(255, 138, 61, 0.12)',
        priceGuide: 'rgba(255, 138, 61, 0.34)',
        scaleSurface: '#151D2A',
        stateLabel: '직결 시세',
        statusFill: 'rgba(255, 138, 61, 0.18)',
        statusText: '#FFB07A',
        volatilityRatio: 0.0048,
      } as const;
  }
};

const buildPreviewCandles = (
  marketPrice: number,
  symbol: string,
  quoteSourceMode: QuoteSourceMode | null | undefined,
) => {
  const chartTone = getChartTone(quoteSourceMode);
  const random = createSeededRandom(hashKey(`${symbol}:${quoteSourceMode ?? 'UNKNOWN'}`));
  const closes = Array.from({ length: PREVIEW_CANDLE_COUNT }, (_, index) => {
    const progress = index / Math.max(PREVIEW_CANDLE_COUNT - 1, 1);
    const wave = Math.sin(progress * Math.PI * 1.7 + random() * 0.6);
    const drift = (progress - 0.5) * marketPrice * chartTone.volatilityRatio * 1.6;
    const jitter = (random() - 0.5) * marketPrice * chartTone.volatilityRatio * 0.75;

    return marketPrice + wave * marketPrice * chartTone.volatilityRatio + drift + jitter;
  });
  const shift = marketPrice - closes[closes.length - 1];

  return closes.map((closeValue, index) => {
    const previousClose = index === 0
      ? closeValue + shift - marketPrice * chartTone.volatilityRatio * 0.65
      : closes[index - 1] + shift;
    const driftBias = index < 10 ? 1 : -1;
    const bodyOffset =
      driftBias * marketPrice * chartTone.volatilityRatio * (0.16 + random() * 0.18);
    const close = normalizePrice(closeValue + shift);
    const open = normalizePrice(previousClose - bodyOffset);
    const high = normalizePrice(
      Math.max(open, close) + marketPrice * chartTone.volatilityRatio * (0.14 + random() * 0.2),
    );
    const low = normalizePrice(
      Math.min(open, close) - marketPrice * chartTone.volatilityRatio * (0.14 + random() * 0.2),
    );

    return {
      close,
      high,
      low,
      open,
    };
  });
};

const buildChartMetrics = (candles: PreviewCandle[]) => {
  const max = Math.max(...candles.map((candle) => candle.high));
  const min = Math.min(...candles.map((candle) => candle.low));
  const safeRange = max - min || 1;

  return {
    max,
    min,
    toPixels: (value: number) => ((value - min) / safeRange) * CHART_HEIGHT,
  };
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

export const DashboardQuoteTicker = ({ position }: DashboardQuoteTickerProps) => {
  if (
    position.marketPrice === null
    || position.marketPrice === undefined
    || !position.quoteAsOf
    || !position.quoteSourceMode
  ) {
    return null;
  }

  const chartTone = getChartTone(position.quoteSourceMode);
  const candles = buildPreviewCandles(
    position.marketPrice,
    position.symbol,
    position.quoteSourceMode,
  );
  const chartMetrics = buildChartMetrics(candles);
  const currentPriceY = CHART_HEIGHT - chartMetrics.toPixels(position.marketPrice);
  const scaleValues = [
    { label: 'HIGH', value: chartMetrics.max },
    { label: 'NOW', value: position.marketPrice },
    { label: 'LOW', value: chartMetrics.min },
  ];

  return (
    <View
      style={{
        gap: 12,
        borderRadius: 24,
        paddingHorizontal: 14,
        paddingVertical: 14,
        backgroundColor: chartTone.boardBackground,
        borderWidth: 1,
        borderColor: chartTone.boardBorder,
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
            시장가 확인용 차트 미리보기
          </Text>
        </View>

        <View
          style={{
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 6,
            backgroundColor: chartTone.accentSoft,
            borderWidth: 1,
            borderColor: chartTone.badgeBorder,
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontWeight: '800',
              letterSpacing: 0.5,
              color: chartTone.accent,
              textTransform: 'uppercase',
            }}
          >
            1D Preview
          </Text>
        </View>
      </View>

      <View
        style={{
          gap: 14,
          borderRadius: 20,
          paddingHorizontal: 14,
          paddingVertical: 14,
          backgroundColor: chartTone.chartSurface,
          borderWidth: 1,
          borderColor: chartTone.boardBorder,
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
                  backgroundColor: chartTone.statusFill,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '800',
                    color: chartTone.statusText,
                  }}
                  testID="mobile-dashboard-quote-ticker-state"
                >
                  {chartTone.stateLabel}
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
                호가 기준 {quoteDateFormatter.format(new Date(position.quoteAsOf))}
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
                backgroundColor: chartTone.accentSoft,
                borderWidth: 1,
                borderColor: chartTone.badgeBorder,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '900',
                  letterSpacing: 0.3,
                  color: chartTone.accent,
                }}
                testID="mobile-dashboard-quote-ticker-mode"
              >
                {position.quoteSourceMode}
              </Text>
            </View>

            <Text
              style={{
                fontSize: 10,
                fontWeight: '700',
                color: 'rgba(255,255,255,0.44)',
                textTransform: 'uppercase',
              }}
            >
              snapshot-seeded
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
              gap: 10,
              alignItems: 'stretch',
            }}
          >
            <View
              style={{
                flex: 1,
                position: 'relative',
                height: CHART_HEIGHT,
                borderRadius: 16,
                overflow: 'hidden',
                backgroundColor: 'rgba(255,255,255,0.03)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.05)',
              }}
            >
              {Array.from({ length: 4 }, (_, index) => (
                <View
                  key={`grid-${index + 1}`}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: index * (CHART_HEIGHT / 3),
                    height: 1,
                    backgroundColor: chartTone.gridColor,
                  }}
                />
              ))}

              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: currentPriceY,
                  height: 1,
                  backgroundColor: chartTone.priceGuide,
                }}
              />

              <View
                style={{
                  position: 'absolute',
                  inset: 0,
                  flexDirection: 'row',
                  alignItems: 'stretch',
                  gap: 3,
                  paddingHorizontal: 5,
                  paddingVertical: 8,
                }}
              >
                {candles.map((candle, index) => {
                  const openHeight = chartMetrics.toPixels(candle.open);
                  const closeHeight = chartMetrics.toPixels(candle.close);
                  const highHeight = chartMetrics.toPixels(candle.high);
                  const lowHeight = chartMetrics.toPixels(candle.low);
                  const upperBodyHeight = Math.max(openHeight, closeHeight);
                  const lowerBodyHeight = Math.min(openHeight, closeHeight);
                  const isBullish = candle.close >= candle.open;

                  return (
                    <View
                      key={`mobile-candle-${index + 1}`}
                      style={{
                        flex: 1,
                        position: 'relative',
                      }}
                      testID="mobile-dashboard-quote-ticker-candle"
                    >
                      <View
                        style={{
                          position: 'absolute',
                          left: '50%',
                          marginLeft: -1,
                          width: 2,
                          top: CHART_HEIGHT - highHeight - 8,
                          bottom: lowHeight + 8,
                          borderRadius: 999,
                          backgroundColor: isBullish ? chartTone.accent : 'rgba(214,223,237,0.62)',
                        }}
                      />
                      <View
                        style={{
                          position: 'absolute',
                          left: '50%',
                          marginLeft: -3.5,
                          width: 7,
                          top: CHART_HEIGHT - upperBodyHeight - 8,
                          bottom: lowerBodyHeight + 8,
                          minHeight: 8,
                          borderRadius: 999,
                          backgroundColor: isBullish ? chartTone.accent : '#E9EFFA',
                        }}
                      />
                    </View>
                  );
                })}
              </View>
            </View>

            <View
              style={{
                width: 66,
                justifyContent: 'space-between',
              }}
            >
              {scaleValues.map((item) => (
                <View
                  key={item.label}
                  style={{
                    borderRadius: 14,
                    paddingHorizontal: 8,
                    paddingVertical: 8,
                    backgroundColor: chartTone.scaleSurface,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.06)',
                    gap: 3,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: '800',
                      letterSpacing: 0.4,
                      color: 'rgba(255,255,255,0.46)',
                    }}
                  >
                    {item.label}
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '800',
                      color: item.label === 'NOW' ? chartTone.accent : '#F5F7FB',
                      fontVariant: ['tabular-nums'],
                    }}
                    numberOfLines={1}
                  >
                    {formatKRW(item.value)}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: '700',
                color: 'rgba(255,255,255,0.44)',
                textTransform: 'uppercase',
              }}
            >
              open
            </Text>
            <Text
              style={{
                fontSize: 10,
                fontWeight: '700',
                color: 'rgba(255,255,255,0.44)',
                textTransform: 'uppercase',
              }}
            >
              intraday preview
            </Text>
            <Text
              style={{
                fontSize: 10,
                fontWeight: '700',
                color: 'rgba(255,255,255,0.44)',
                textTransform: 'uppercase',
              }}
            >
              now
            </Text>
          </View>
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
            value={quoteDateFormatter.format(new Date(position.quoteAsOf))}
            valueTestID="mobile-dashboard-quote-ticker-quote-as-of"
          />
          <MetaChip
            label="Snapshot"
            value={position.quoteSnapshotId ?? 'pending'}
            valueTestID="mobile-dashboard-quote-ticker-snapshot"
          />
          <MetaChip
            label="조회 기준"
            value={quoteDateFormatter.format(new Date(position.asOf))}
          />
          <MetaChip
            label="데이터 상태"
            value={chartTone.stateLabel}
          />
        </View>

        <Text
          style={{
            fontSize: 11,
            fontWeight: '600',
            color: 'rgba(255,255,255,0.42)',
          }}
        >
          차트는 최신 snapshot을 기반으로 만든 미리보기이며, 실제 분봉 히스토리와는 다를 수 있습니다.
        </Text>
      </View>
    </View>
  );
};
