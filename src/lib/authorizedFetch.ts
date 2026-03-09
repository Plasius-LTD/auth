import { useCallback } from "react";

let refreshPromise: Promise<Response> | null = null;
let refreshCooldownUntil = 0;
let consecutiveOutageFailures = 0;
let lastOutageBackoffMs = 0;

const MAX_REFRESH_ATTEMPTS_PER_REQUEST = 1;
const DEFAULT_REFRESH_COOLDOWN_MS = 30_000;
const OUTAGE_BACKOFF_BASE_MS = 5_000;
const OUTAGE_BACKOFF_MAX_MS = 120_000;
const OUTAGE_JITTER_MIN = 0.75;
const OUTAGE_JITTER_MAX = 1.25;

export function useAuthorizedFetch() {
  return useCallback(createAuthorizedFetch(), []);
}

function parseRetryAfterMs(retryAfterValue: string | null): number | null {
  if (!retryAfterValue) return null;

  const retryAfterSeconds = parseInt(retryAfterValue, 10);
  if (!Number.isNaN(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }

  const retryAt = Date.parse(retryAfterValue);
  if (Number.isNaN(retryAt)) return null;

  const deltaMs = retryAt - Date.now();
  return deltaMs > 0 ? deltaMs : null;
}

function isOutageStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function resetOutageBackoffState() {
  consecutiveOutageFailures = 0;
  lastOutageBackoffMs = 0;
}

function nextOutageBackoffMs(): number {
  consecutiveOutageFailures += 1;

  const logarithmicGrowth = 1 + Math.log2(consecutiveOutageFailures + 1);
  const jitterSpread = OUTAGE_JITTER_MAX - OUTAGE_JITTER_MIN;
  const jitter = OUTAGE_JITTER_MIN + Math.random() * jitterSpread;

  const rawBackoffMs = Math.round(OUTAGE_BACKOFF_BASE_MS * logarithmicGrowth * jitter);
  const clampedBackoffMs = Math.min(
    Math.max(rawBackoffMs, OUTAGE_BACKOFF_BASE_MS),
    OUTAGE_BACKOFF_MAX_MS
  );

  const monotonicBackoffMs = Math.max(clampedBackoffMs, lastOutageBackoffMs);
  lastOutageBackoffMs = monotonicBackoffMs;

  return monotonicBackoffMs;
}

function applyRefreshCooldown(options: {
  isOutage: boolean;
  retryAfterHeader: string | null;
}) {
  const retryAfterMs = parseRetryAfterMs(options.retryAfterHeader);
  let cooldownMs: number;

  if (retryAfterMs !== null) {
    cooldownMs = retryAfterMs;
    if (options.isOutage) {
      consecutiveOutageFailures += 1;
    } else {
      resetOutageBackoffState();
    }
  } else if (options.isOutage) {
    cooldownMs = nextOutageBackoffMs();
  } else {
    resetOutageBackoffState();
    cooldownMs = DEFAULT_REFRESH_COOLDOWN_MS;
  }

  refreshCooldownUntil = Date.now() + cooldownMs;
}

export function createAuthorizedFetch() {
  const getCsrfToken = (): string | undefined =>
    document.cookie
      .split("; ")
      .find((row) => row.startsWith("csrf-token="))
      ?.split("=")[1];

  const fetchWithAuth = async (
    input: RequestInfo,
    init: RequestInit = {}
  ): Promise<Response> => {
    const csrfToken = getCsrfToken();

    return fetch(input, {
      ...init,
      credentials: "include",
      headers: {
        ...init.headers,
        ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      },
    });
  };

  const requestRefresh = async (): Promise<Response> => {
    if (!refreshPromise) {
      refreshPromise = fetchWithAuth(`/oauth/refresh-token`, {
        method: "POST",
      }).finally(() => {
        refreshPromise = null;
      });
    }

    return refreshPromise;
  };

  const authorizedFetch = async (
    input: RequestInfo,
    init: RequestInit = {}
  ): Promise<Response> => {
    let response = await fetchWithAuth(input, init);

    if (response.status !== 401) {
      return response;
    }

    if (Date.now() < refreshCooldownUntil) {
      return response;
    }

    let refreshAttempts = 0;
    while (refreshAttempts < MAX_REFRESH_ATTEMPTS_PER_REQUEST) {
      refreshAttempts += 1;

      let refreshResponse: Response;
      try {
        refreshResponse = await requestRefresh();
      } catch {
        applyRefreshCooldown({
          isOutage: true,
          retryAfterHeader: null,
        });
        return response;
      }

      if (!refreshResponse.ok) {
        applyRefreshCooldown({
          isOutage: isOutageStatus(refreshResponse.status),
          retryAfterHeader: refreshResponse.headers.get("Retry-After"),
        });
        return response;
      }

      const retryAfter = parseRetryAfterMs(
        refreshResponse.headers.get("Retry-After")
      );

      if (retryAfter !== null) {
        await new Promise((resolve) => setTimeout(resolve, retryAfter));
      }

      response = await fetchWithAuth(input, init);
      if (response.status !== 401) {
        refreshCooldownUntil = 0;
        resetOutageBackoffState();
        return response;
      }
    }

    applyRefreshCooldown({
      isOutage: false,
      retryAfterHeader: response.headers.get("Retry-After"),
    });
    return response;
  };

  return authorizedFetch;
}
