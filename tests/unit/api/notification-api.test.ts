import { createNotificationApi } from '@/api/notification-api';

describe('notification api', () => {
  const client = {
    get: vi.fn(),
    request: vi.fn(),
  };

  beforeEach(() => {
    client.get.mockReset();
    client.request.mockReset();
  });

  it('loads notifications with default pagination and json accept header', async () => {
    client.get.mockResolvedValue({
      statusCode: 200,
      body: {
        items: [
          {
            notificationId: 101,
            channel: 'ORDER_SESSION',
            message: 'Order session requires MFA verification.',
            delivered: true,
            read: false,
            readAt: null,
          },
        ],
      },
    });

    const notificationApi = createNotificationApi({
      baseUrl: 'https://api.fix.example',
      client,
    });

    await expect(notificationApi.listNotifications()).resolves.toEqual([
      {
        notificationId: 101,
        channel: 'ORDER_SESSION',
        message: 'Order session requires MFA verification.',
        delivered: true,
        read: false,
        readAt: null,
      },
    ]);

    expect(client.get).toHaveBeenCalledWith('/api/v1/notifications?limit=20', {
      headers: {
        Accept: 'application/json',
      },
    });
  });

  it('forwards explicit pagination values to the notification feed endpoint', async () => {
    client.get.mockResolvedValue({
      statusCode: 200,
      body: {
        items: [],
      },
    });

    const notificationApi = createNotificationApi({
      baseUrl: 'https://api.fix.example',
      client,
    });

    await expect(
      notificationApi.listNotifications({
        limit: 50,
        cursorId: 99,
      }),
    ).resolves.toEqual([]);

    expect(client.get).toHaveBeenCalledWith('/api/v1/notifications?limit=50&cursorId=99', {
      headers: {
        Accept: 'application/json',
      },
    });
  });

  it('marks notification read via canonical patch endpoint', async () => {
    client.request.mockResolvedValue({
      statusCode: 200,
      body: {
        notificationId: 101,
        channel: 'ORDER_SESSION',
        message: 'Order session requires MFA verification.',
        delivered: true,
        read: true,
        readAt: '2026-03-15T08:00:00Z',
      },
    });

    const notificationApi = createNotificationApi({
      baseUrl: 'https://api.fix.example',
      client,
    });

    await expect(notificationApi.markNotificationRead(101)).resolves.toMatchObject({
      notificationId: 101,
      read: true,
    });

    expect(client.request).toHaveBeenCalledWith('/api/v1/notifications/101/read', {
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
      },
    });
  });

  it('builds stream url with normalized base url', () => {
    const notificationApi = createNotificationApi({
      baseUrl: 'https://api.fix.example///',
      client,
    });

    expect(notificationApi.getStreamUrl()).toBe('https://api.fix.example/api/v1/notifications/stream');
  });
});
