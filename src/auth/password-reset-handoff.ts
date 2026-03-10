const RESET_ROUTE_HINTS = ['reset-password', 'password-reset'];

const normalizeToken = (value: string | null) => {
  const normalized = value?.trim();

  return normalized ? normalized : null;
};

const extractRouteHint = (url: string) => {
  const sanitized = url.split('#', 1)[0] ?? url;
  const [routePart] = sanitized.split('?', 1);

  return routePart.toLowerCase();
};

const extractQueryString = (url: string) => {
  const questionIndex = url.indexOf('?');

  if (questionIndex === -1) {
    return '';
  }

  const hashIndex = url.indexOf('#', questionIndex);

  return hashIndex === -1
    ? url.slice(questionIndex + 1)
    : url.slice(questionIndex + 1, hashIndex);
};

export const extractPasswordResetTokenFromUrl = (
  url: string | null | undefined,
): string | null => {
  if (!url) {
    return null;
  }

  try {
    const routeHint = extractRouteHint(url);

    if (!RESET_ROUTE_HINTS.some((hint) => routeHint.includes(hint))) {
      return null;
    }

    const searchParams = new URLSearchParams(extractQueryString(url));

    return normalizeToken(
      searchParams.get('token')
      ?? searchParams.get('resetToken'),
    );
  } catch {
    return null;
  }
};
