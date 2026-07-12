import type { AuthProvider } from "@plasius/entity-manager";

/** Encode a UTF-8 return path with the RFC 4648 base64url alphabet. */
export function encodeLoginReturnTo(returnTo: string): string {
  const bytes = new TextEncoder().encode(returnTo);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function useLogin() {
  return async function loginWithProvider(provider: AuthProvider) {
    const returnTo = window.location.pathname;
    const state = encodeLoginReturnTo(returnTo);
    window.location.href = `/oauth/${provider}?state=${state}`;
  };
}
