import { useCallback } from "react";

let refreshPromise: Promise<Response> | null = null;

export function useAuthorizedFetch() {
  return useCallback(createAuthorizedFetch(), []);
}

export function createAuthorizedFetch() {
  const authorizedFetch = async (
    input: RequestInfo,
    init: RequestInit = {}
  ): Promise<Response> => {
    const csrfToken = document.cookie
      .split("; ")
      .find((row) => row.startsWith("csrf-token="))
      ?.split("=")[1];

    let response = await fetch(input, {
      ...init,
      credentials: "include",
      headers: {
        ...init.headers,
        ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      },
    });

    if (response.status !== 401) {
      return response;
    }

    if (!refreshPromise) {
      refreshPromise = fetch(`/oauth/refresh-token`, {
        method: "POST",
        credentials: "include",
      }).finally(() => {
        refreshPromise = null;
      });
    }

    const refreshResponse = await refreshPromise;

    if (!refreshResponse.ok) {
      return response;
    }

    const retryAfter = parseInt(
      refreshResponse.headers.get("Retry-After") ?? "0",
      10
    );

    if (!isNaN(retryAfter) && retryAfter > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    }

    return await authorizedFetch(input, init);
  };

  return authorizedFetch;
}
