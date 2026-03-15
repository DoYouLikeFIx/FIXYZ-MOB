import { useEffect, useState } from 'react';

const formatExpiryTime = (expiresAt: string) => {
  const date = new Date(expiresAt);

  if (Number.isNaN(date.getTime())) {
    return '유효 시간 확인 중';
  }

  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatRemaining = (remainingSeconds: number) => {
  if (remainingSeconds <= 0) {
    return '만료됨';
  }

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return `${minutes}분 ${seconds.toString().padStart(2, '0')}초 남음`;
};

const getRemainingSeconds = (expiresAt: string) => {
  const expiresAtMs = new Date(expiresAt).getTime();

  if (Number.isNaN(expiresAtMs)) {
    return 0;
  }

  return Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000));
};

export const useExpiryCountdown = (expiresAt: string) => {
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    getRemainingSeconds(expiresAt),
  );

  useEffect(() => {
    setRemainingSeconds(getRemainingSeconds(expiresAt));

    const timerId = setInterval(() => {
      setRemainingSeconds(getRemainingSeconds(expiresAt));
    }, 1000);

    return () => {
      clearInterval(timerId);
    };
  }, [expiresAt]);

  return {
    expiresAtLabel: formatExpiryTime(expiresAt),
    remainingLabel: formatRemaining(remainingSeconds),
    remainingSeconds,
    isExpired: remainingSeconds === 0,
    isExpiringSoon: remainingSeconds > 0 && remainingSeconds <= 60,
  };
};
