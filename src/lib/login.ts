import type { AuthProvider } from "@plasius/entity-manager";

export function useLogin() {
  return async function loginWithProvider(provider: AuthProvider) {
    const returnTo = window.location.pathname;
    const state = btoa(returnTo);
    window.location.href = `/oauth/${provider}?state=${state}`;
  };
}
