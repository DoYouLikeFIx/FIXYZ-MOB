import type { HttpClient } from '../network/http-client';

export interface NotificationItem {
  notificationId: number;
  channel: string;
  message: string;
  delivered: boolean;
  read: boolean;
  readAt: string | null;
}

interface NotificationStreamResponse {
  items: NotificationItem[];
}

export interface NotificationApi {
  listNotifications: (payload?: {
    limit?: number;
    cursorId?: number;
  }) => Promise<NotificationItem[]>;
  markNotificationRead: (notificationId: number) => Promise<NotificationItem>;
  getStreamUrl: () => string;
}

interface CreateNotificationApiInput {
  baseUrl: string;
  client: Pick<HttpClient, 'get' | 'request'>;
}

const DEFAULT_LIMIT = 20;

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, '');

const buildListPath = (payload?: { limit?: number; cursorId?: number }) => {
  const limit = payload?.limit ?? DEFAULT_LIMIT;
  const search = new URLSearchParams();

  search.set('limit', String(limit));

  if (payload?.cursorId) {
    search.set('cursorId', String(payload.cursorId));
  }

  return `/api/v1/notifications?${search.toString()}`;
};

export const createNotificationApi = ({
  baseUrl,
  client,
}: CreateNotificationApiInput): NotificationApi => {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  return {
    listNotifications: async (payload) => {
      const response = await client.get<NotificationStreamResponse>(buildListPath(payload), {
        headers: {
          Accept: 'application/json',
        },
      });

      return response.body.items;
    },
    markNotificationRead: async (notificationId) => {
      const response = await client.request<NotificationItem>(
        `/api/v1/notifications/${notificationId}/read`,
        {
          method: 'PATCH',
          headers: {
            Accept: 'application/json',
          },
        },
      );

      return response.body;
    },
    getStreamUrl: () => `${normalizedBaseUrl}/api/v1/notifications/stream`,
  };
};
