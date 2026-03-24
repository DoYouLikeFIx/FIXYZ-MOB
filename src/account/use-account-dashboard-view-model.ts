import { useEffect, useMemo, useRef, useState } from 'react';

import type { AccountApi } from '../api/account-api';
import {
  getAccountDashboardErrorPresentation,
  type AccountDashboardErrorPresentation,
} from './account-dashboard-errors';
import { maskAccountNumber } from './account-masking';
import type {
  AccountOrderHistoryPage,
  AccountPosition,
  AccountSummary,
} from '../types/account';

interface AsyncState<T> {
  data: T | null;
  error: AccountDashboardErrorPresentation | null;
  loading: boolean;
  scopeKey: string | null;
}

interface RefreshState {
  positions: boolean;
  summary: boolean;
  history: boolean;
}

interface UseAccountDashboardViewModelInput {
  accountApi: AccountApi;
  accountId?: string;
}

const HISTORY_PAGE_SIZE = 5;

const createAsyncState = <T,>(
  scopeKey: string | null,
  loading = false,
): AsyncState<T> => ({
  data: null,
  error: null,
  loading,
  scopeKey,
});

const hasNumericAccountId = (value?: string) =>
  typeof value === 'string' && /^\d+$/.test(value);

export const useAccountDashboardViewModel = ({
  accountApi,
  accountId,
}: UseAccountDashboardViewModelInput) => {
  const hasLinkedAccount = hasNumericAccountId(accountId);
  const currentScopeKey = hasLinkedAccount && accountId ? accountId : null;
  const maskedAccountNumber = useMemo(
    () => maskAccountNumber(accountId),
    [accountId],
  );
  const [preferredSymbol, setPreferredSymbol] = useState<string | null>(null);
  const [summaryState, setSummaryState] = useState<AsyncState<AccountSummary>>(() =>
    createAsyncState<AccountSummary>(currentScopeKey, Boolean(currentScopeKey)),
  );
  const [positionsState, setPositionsState] = useState<AsyncState<AccountPosition[]>>(() =>
    createAsyncState<AccountPosition[]>(currentScopeKey, Boolean(currentScopeKey)),
  );
  const [historyState, setHistoryState] = useState<AsyncState<AccountOrderHistoryPage>>(() =>
    createAsyncState<AccountOrderHistoryPage>(currentScopeKey, Boolean(currentScopeKey)),
  );
  const [summaryReloadKey, setSummaryReloadKey] = useState(0);
  const [positionsReloadKey, setPositionsReloadKey] = useState(0);
  const [historyReloadKey, setHistoryReloadKey] = useState(0);
  const [refreshState, setRefreshState] = useState<RefreshState>({
    positions: false,
    summary: false,
    history: false,
  });
  const summaryRequestIdRef = useRef(0);
  const positionsRequestIdRef = useRef(0);
  const historyRequestIdRef = useRef(0);

  useEffect(() => {
    if (!currentScopeKey) {
      setSummaryState(createAsyncState<AccountSummary>(null));
      setPositionsState(createAsyncState<AccountPosition[]>(null));
      setHistoryState(createAsyncState<AccountOrderHistoryPage>(null));
      setRefreshState({
        positions: false,
        summary: false,
        history: false,
      });
      return;
    }

    const requestId = ++summaryRequestIdRef.current;
    let cancelled = false;

    void accountApi.fetchAccountSummary({
      accountId: currentScopeKey,
    })
      .then((data) => {
        if (cancelled || requestId !== summaryRequestIdRef.current) {
          return;
        }

        setSummaryState({
          data,
          error: null,
          loading: false,
          scopeKey: currentScopeKey,
        });
        setRefreshState((current) => ({
          ...current,
          summary: false,
        }));
      })
      .catch((error: unknown) => {
        if (cancelled || requestId !== summaryRequestIdRef.current) {
          return;
        }

        setSummaryState({
          data: null,
          error: getAccountDashboardErrorPresentation(error),
          loading: false,
          scopeKey: currentScopeKey,
        });
        setRefreshState((current) => ({
          ...current,
          summary: false,
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [accountApi, currentScopeKey, summaryReloadKey]);

  useEffect(() => {
    if (!currentScopeKey) {
      return;
    }

    const requestId = ++positionsRequestIdRef.current;
    let cancelled = false;

    void accountApi.fetchAccountPositions({
      accountId: currentScopeKey,
    })
      .then((data) => {
        if (cancelled || requestId !== positionsRequestIdRef.current) {
          return;
        }

        setPositionsState({
          data,
          error: null,
          loading: false,
          scopeKey: currentScopeKey,
        });
        setRefreshState((current) => ({
          ...current,
          positions: false,
        }));
      })
      .catch((error: unknown) => {
        if (cancelled || requestId !== positionsRequestIdRef.current) {
          return;
        }

        setPositionsState({
          data: null,
          error: getAccountDashboardErrorPresentation(error),
          loading: false,
          scopeKey: currentScopeKey,
        });
        setRefreshState((current) => ({
          ...current,
          positions: false,
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [accountApi, currentScopeKey, positionsReloadKey]);

  useEffect(() => {
    if (!currentScopeKey) {
      return;
    }

    const requestId = ++historyRequestIdRef.current;
    let cancelled = false;

    void accountApi.fetchAccountOrderHistory({
      accountId: currentScopeKey,
      page: 0,
      size: HISTORY_PAGE_SIZE,
    })
      .then((data) => {
        if (cancelled || requestId !== historyRequestIdRef.current) {
          return;
        }

        setHistoryState({
          data,
          error: null,
          loading: false,
          scopeKey: currentScopeKey,
        });
        setRefreshState((current) => ({
          ...current,
          history: false,
        }));
      })
      .catch((error: unknown) => {
        if (cancelled || requestId !== historyRequestIdRef.current) {
          return;
        }

        setHistoryState({
          data: null,
          error: getAccountDashboardErrorPresentation(error),
          loading: false,
          scopeKey: currentScopeKey,
        });
        setRefreshState((current) => ({
          ...current,
          history: false,
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [accountApi, currentScopeKey, historyReloadKey]);

  const summary =
    summaryState.scopeKey === currentScopeKey ? summaryState.data : null;
  const summaryError =
    summaryState.scopeKey === currentScopeKey ? summaryState.error : null;
  const positionItems = useMemo(
    () => (positionsState.scopeKey === currentScopeKey ? positionsState.data ?? [] : []),
    [currentScopeKey, positionsState.data, positionsState.scopeKey],
  );
  const symbolOptionsError =
    positionsState.scopeKey === currentScopeKey ? positionsState.error : null;
  const positionLoading = Boolean(currentScopeKey) && (
    summaryState.loading
    || positionsState.loading
    || summaryState.scopeKey !== currentScopeKey
    || positionsState.scopeKey !== currentScopeKey
  );
  const selectedSymbol = useMemo(() => {
    if (positionItems.length === 0) {
      return null;
    }

    if (
      preferredSymbol
      && positionItems.some((item) => item.symbol === preferredSymbol)
    ) {
      return preferredSymbol;
    }

    return positionItems[0].symbol;
  }, [positionItems, preferredSymbol]);
  const selectedPosition = useMemo(
    () => positionItems.find((item) => item.symbol === selectedSymbol) ?? null,
    [positionItems, selectedSymbol],
  );
  const position = selectedPosition ?? summary;
  const positionError = position ? null : (summaryError ?? symbolOptionsError);
  const valuationError = selectedPosition ? null : symbolOptionsError;
  const symbolOptions = useMemo(
    () => positionItems.map((item) => item.symbol),
    [positionItems],
  );

  const historyItems = currentScopeKey && historyState.scopeKey === currentScopeKey
    ? historyState.data?.content ?? []
    : [];
  const historyError =
    historyState.scopeKey === currentScopeKey ? historyState.error : null;
  const historyLoading = Boolean(currentScopeKey) && (
    historyState.loading || historyState.scopeKey !== currentScopeKey
  );

  return {
    hasLinkedAccount,
    historyError,
    historyItems,
    historyLoading,
    historyTotalElements:
      currentScopeKey && historyState.scopeKey === currentScopeKey
        ? historyState.data?.totalElements ?? 0
        : 0,
    isRefreshing: refreshState.positions || refreshState.summary || refreshState.history,
    maskedAccountNumber,
    position,
    valuationPosition: selectedPosition,
    valuationError,
    positionError,
    positionLoading,
    refresh: () => {
      if (!currentScopeKey) {
        setSummaryState(createAsyncState<AccountSummary>(null));
        setPositionsState(createAsyncState<AccountPosition[]>(null));
        setHistoryState(createAsyncState<AccountOrderHistoryPage>(null));
        setRefreshState({
          positions: false,
          summary: false,
          history: false,
        });
        return;
      }

      setRefreshState({
        positions: true,
        summary: true,
        history: true,
      });
      setSummaryState((current) => ({
        ...current,
        error: null,
        loading: true,
        scopeKey: currentScopeKey,
      }));
      setPositionsState((current) => ({
        ...current,
        error: null,
        loading: true,
        scopeKey: currentScopeKey,
      }));
      setHistoryState((current) => ({
        ...current,
        error: null,
        loading: true,
        scopeKey: currentScopeKey,
      }));
      setSummaryReloadKey((current) => current + 1);
      setPositionsReloadKey((current) => current + 1);
      setHistoryReloadKey((current) => current + 1);
    },
    retryHistory: () => {
      if (!currentScopeKey) {
        setHistoryState(createAsyncState<AccountOrderHistoryPage>(null));
        return;
      }

      setHistoryState((current) => ({
        ...current,
        error: null,
        loading: true,
        scopeKey: currentScopeKey,
      }));
      setHistoryReloadKey((current) => current + 1);
    },
    retryPosition: () => {
      if (!currentScopeKey) {
        setSummaryState(createAsyncState<AccountSummary>(null));
        setPositionsState(createAsyncState<AccountPosition[]>(null));
        return;
      }

      setSummaryState((current) => ({
        ...current,
        error: null,
        loading: true,
        scopeKey: currentScopeKey,
      }));
      setPositionsState((current) => ({
        ...current,
        error: null,
        loading: true,
        scopeKey: currentScopeKey,
      }));
      setSummaryReloadKey((current) => current + 1);
      setPositionsReloadKey((current) => current + 1);
    },
    selectedSymbol,
    setSelectedSymbol: (symbol: string) => {
      setPreferredSymbol(symbol);
    },
    symbolOptions,
    symbolOptionsError,
  };
};
