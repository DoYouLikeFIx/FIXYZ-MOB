import { createAccountApi } from '@/api/account-api';
import type { AccountPosition, AccountSummary } from '@/types/account';

describe('account api', () => {
  const client = {
    get: vi.fn(),
  };

  beforeEach(() => {
    client.get.mockReset();
  });

  it('requests the account position with the expected symbol query', async () => {
    client.get.mockResolvedValue({
      statusCode: 200,
      body: {
        accountId: 1,
        memberId: 1,
        symbol: '005930',
      },
    });

    const accountApi = createAccountApi({ client });

    await accountApi.fetchAccountPosition({
      accountId: '1',
      symbol: '005930',
    });

    expect(client.get).toHaveBeenCalledWith(
      '/api/v1/accounts/1/positions?symbol=005930',
      {
        headers: {
          Accept: 'application/json',
        },
      },
    );
  });

  it('requests the owned account positions list endpoint', async () => {
    client.get.mockResolvedValue({
      statusCode: 200,
      body: [],
    });

    const accountApi = createAccountApi({ client });

    await accountApi.fetchAccountPositions({
      accountId: '1',
    });

    expect(client.get).toHaveBeenCalledWith(
      '/api/v1/accounts/1/positions/list',
      {
        headers: {
          Accept: 'application/json',
        },
      },
    );
  });

  it('requests the account summary endpoint', async () => {
    client.get.mockResolvedValue({
      statusCode: 200,
      body: {
        accountId: 1,
        memberId: 1,
        symbol: '',
      },
    });

    const accountApi = createAccountApi({ client });

    await accountApi.fetchAccountSummary({
      accountId: '1',
    });

    expect(client.get).toHaveBeenCalledWith(
      '/api/v1/accounts/1/summary',
      {
        headers: {
          Accept: 'application/json',
        },
      },
    );
  });

  it('returns the summary payload without inventing valuation fields', async () => {
    const summaryBody: AccountSummary = {
      accountId: 1,
      memberId: 1,
      symbol: '005930',
      quantity: 10,
      availableQuantity: 8,
      availableQty: 8,
      balance: 1_500_000,
      availableBalance: 1_500_000,
      currency: 'KRW',
      asOf: '2026-03-24T09:00:00Z',
    };
    client.get.mockResolvedValue({
      statusCode: 200,
      body: summaryBody,
    });

    const accountApi = createAccountApi({ client });
    const result = await accountApi.fetchAccountSummary({
      accountId: '1',
    });

    expect(result).toEqual(summaryBody);
    expect(result).not.toHaveProperty('valuationStatus');
    expect(result).not.toHaveProperty('marketPrice');
  });

  it('preserves valuation nullability on position payloads', async () => {
    const positionBody: AccountPosition = {
      accountId: 1,
      memberId: 1,
      symbol: '005930',
      quantity: 10,
      availableQuantity: 8,
      availableQty: 8,
      balance: 1_500_000,
      availableBalance: 1_500_000,
      currency: 'KRW',
      asOf: '2026-03-24T09:00:00Z',
      avgPrice: 70_000,
      marketPrice: null,
      quoteSnapshotId: null,
      quoteAsOf: null,
      quoteSourceMode: null,
      unrealizedPnl: null,
      realizedPnlDaily: null,
      valuationStatus: 'UNAVAILABLE',
      valuationUnavailableReason: 'PROVIDER_UNAVAILABLE',
    };
    client.get.mockResolvedValue({
      statusCode: 200,
      body: [positionBody],
    });

    const accountApi = createAccountApi({ client });
    const [result] = await accountApi.fetchAccountPositions({
      accountId: '1',
    });

    expect(result).toEqual(positionBody);
    expect(result.marketPrice).toBeNull();
    expect(result.unrealizedPnl).toBeNull();
    expect(result.valuationStatus).toBe('UNAVAILABLE');
    expect(result.valuationUnavailableReason).toBe('PROVIDER_UNAVAILABLE');
  });

  it('preserves valuation metadata on single-position payloads used by the market ticker', async () => {
    const positionBody: AccountPosition = {
      accountId: 1,
      memberId: 1,
      symbol: '005930',
      quantity: 10,
      availableQuantity: 8,
      availableQty: 8,
      balance: 1_500_000,
      availableBalance: 1_500_000,
      currency: 'KRW',
      asOf: '2026-03-24T09:00:00Z',
      avgPrice: 70_000,
      marketPrice: null,
      quoteSnapshotId: 'quote-001',
      quoteAsOf: '2026-03-24T08:55:00Z',
      quoteSourceMode: 'REPLAY',
      unrealizedPnl: null,
      realizedPnlDaily: null,
      valuationStatus: 'STALE',
      valuationUnavailableReason: 'STALE_QUOTE',
    };
    client.get.mockResolvedValue({
      statusCode: 200,
      body: positionBody,
    });

    const accountApi = createAccountApi({ client });
    const result = await accountApi.fetchAccountPosition({
      accountId: '1',
      symbol: '005930',
    });

    expect(result).toEqual(positionBody);
    expect(result.marketPrice).toBeNull();
    expect(result.quoteSourceMode).toBe('REPLAY');
    expect(result.valuationStatus).toBe('STALE');
    expect(result.valuationUnavailableReason).toBe('STALE_QUOTE');
  });

  it('requests account order history with page and size query parameters', async () => {
    client.get.mockResolvedValue({
      statusCode: 200,
      body: {
        content: [],
        totalElements: 0,
        totalPages: 0,
        number: 0,
        size: 5,
      },
    });

    const accountApi = createAccountApi({ client });

    await accountApi.fetchAccountOrderHistory({
      accountId: '1',
      page: 0,
      size: 5,
    });

    expect(client.get).toHaveBeenCalledWith(
      '/api/v1/accounts/1/orders?page=0&size=5',
      {
        headers: {
          Accept: 'application/json',
        },
      },
    );
  });
});
