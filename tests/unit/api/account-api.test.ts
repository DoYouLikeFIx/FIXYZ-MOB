import { createAccountApi } from '@/api/account-api';

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
