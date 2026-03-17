import { useEffect, useMemo, useState } from 'react';

import type { NotificationApi, NotificationItem } from '../api/notification-api';

const RECONNECT_DELAYS_MS = [3_000, 6_000, 12_000] as const;
const NOTIFICATION_LIST_LIMIT = 20;

const RETRY_GUIDANCE_MESSAGE =
  '알림 연결이 반복적으로 끊겼습니다. 네트워크를 확인한 뒤 앱을 새로고침해 주세요.';

type ConnectionState = 'connecting' | 'connected' | 'retrying' | 'retry-exhausted';

interface EventSourceLike {
  onopen: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: { data?: string }) => void) | null;
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  close: () => void;
}

interface UseNotificationFeedViewModelInput {
  accountId?: string;
  notificationApi: NotificationApi;
}

const getEventSourceConstructor = () => {
  if (!('EventSource' in globalThis)) {
    return null;
  }

  return globalThis.EventSource as unknown as new (
    url: string,
    init?: EventSourceInit,
  ) => EventSourceLike;
};

const mergeNotifications = (
  current: NotificationItem[],
  incoming: NotificationItem[],
): NotificationItem[] => {
  const mergedMap = new Map<number, NotificationItem>();

  for (const item of current) {
    mergedMap.set(item.notificationId, item);
  }

  for (const item of incoming) {
    mergedMap.set(item.notificationId, item);
  }

  return [...mergedMap.values()]
    .sort((left, right) => right.notificationId - left.notificationId)
    .slice(0, NOTIFICATION_LIST_LIMIT);
};

const parseNotificationEvent = (rawData: string): NotificationItem | null => {
  if (rawData === 'ok') {
    return null;
  }

  try {
    const parsed = JSON.parse(rawData) as Partial<NotificationItem>;

    if (
      typeof parsed.notificationId !== 'number'
      || typeof parsed.channel !== 'string'
      || typeof parsed.message !== 'string'
      || typeof parsed.delivered !== 'boolean'
    ) {
      return null;
    }

    return {
      notificationId: parsed.notificationId,
      channel: parsed.channel,
      message: parsed.message,
      delivered: parsed.delivered,
      read: Boolean(parsed.read),
      readAt: typeof parsed.readAt === 'string' ? parsed.readAt : null,
    };
  } catch {
    return null;
  }
};

export const useNotificationFeedViewModel = ({
  accountId,
  notificationApi,
}: UseNotificationFeedViewModelInput) => {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [retryGuidance, setRetryGuidance] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId) {
      setItems([]);
      setIsInitialLoading(false);
      setConnectionState('connecting');
      setRetryGuidance(null);
      return undefined;
    }

    let active = true;
    let stream: EventSourceLike | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let hasEverConnected = false;

    const EventSourceConstructor = getEventSourceConstructor();

    const syncMissedNotifications = async () => {
      try {
        const latest = await notificationApi.listNotifications({
          limit: NOTIFICATION_LIST_LIMIT,
        });

        if (!active) {
          return;
        }

        setItems((current) => mergeNotifications(current, latest));
      } catch {
        // Keep the existing feed state and retry through stream reconnect flow.
      }
    };

    const loadInitialNotifications = async () => {
      setIsInitialLoading(true);
      await syncMissedNotifications();
      if (active) {
        setIsInitialLoading(false);
      }
    };

    const cleanupStream = () => {
      stream?.close();
      stream = null;
    };

    const connect = () => {
      if (!active) {
        return;
      }

      if (!EventSourceConstructor) {
        setConnectionState('retry-exhausted');
        setRetryGuidance(RETRY_GUIDANCE_MESSAGE);
        return;
      }

      setConnectionState(hasEverConnected ? 'retrying' : 'connecting');

      try {
        stream = new EventSourceConstructor(notificationApi.getStreamUrl(), {
          withCredentials: true,
        });
      } catch {
        setConnectionState('retry-exhausted');
        setRetryGuidance(RETRY_GUIDANCE_MESSAGE);
        return;
      }

      const handleMessage = (event: { data?: string }) => {
        if (typeof event.data !== 'string') {
          return;
        }

        const parsed = parseNotificationEvent(event.data);

        if (parsed) {
          setItems((current) => mergeNotifications(current, [parsed]));
        }
      };

      const handleNotificationEvent = ((event: MessageEvent<string>) => {
        if (typeof event.data !== 'string') {
          return;
        }

        const parsed = parseNotificationEvent(event.data);

        if (parsed) {
          setItems((current) => mergeNotifications(current, [parsed]));
        }
      }) as EventListener;

      stream.onmessage = handleMessage;
      stream.addEventListener('notification', handleNotificationEvent);
      stream.onopen = () => {
        if (!active) {
          return;
        }

        const recoveredAfterDisconnect = hasEverConnected;
        hasEverConnected = true;
        reconnectAttempt = 0;
        setRetryGuidance(null);
        setConnectionState('connected');

        if (recoveredAfterDisconnect) {
          void syncMissedNotifications();
        }
      };
      stream.onerror = () => {
        stream?.removeEventListener('notification', handleNotificationEvent);
        cleanupStream();

        if (!active) {
          return;
        }

        if (reconnectAttempt >= RECONNECT_DELAYS_MS.length) {
          setConnectionState('retry-exhausted');
          setRetryGuidance(RETRY_GUIDANCE_MESSAGE);
          return;
        }

        setConnectionState('retrying');
        const delayMs = RECONNECT_DELAYS_MS[reconnectAttempt];
        reconnectAttempt += 1;
        reconnectTimer = setTimeout(connect, delayMs);
      };
    };

    void loadInitialNotifications();
    connect();

    return () => {
      active = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      cleanupStream();
    };
  }, [accountId, notificationApi]);

  const markAsRead = async (notificationId: number) => {
    const previousItem = items.find((item) => item.notificationId === notificationId) ?? null;

    setItems((current) => current.map((item) => {
      if (item.notificationId !== notificationId) {
        return item;
      }
      return {
        ...item,
        read: true,
        readAt: item.readAt ?? new Date().toISOString(),
      };
    }));

    try {
      const updated = await notificationApi.markNotificationRead(notificationId);
      setItems((current) => current.map((item) => (
        item.notificationId === notificationId ? updated : item
      )));
    } catch {
      if (!previousItem) {
        return;
      }

      setItems((current) => current.map((item) => (
        item.notificationId === notificationId ? previousItem as NotificationItem : item
      )));
    }
  };

  return useMemo(() => ({
    connectionState,
    isInitialLoading,
    items,
    markAsRead,
    retryGuidance,
  }), [connectionState, isInitialLoading, items, retryGuidance]);
};
