import { useAuthorizedFetch } from "./authorizedFetch.js";

export function useLogout() {
  const authorizedFetch = useAuthorizedFetch();
  return async function logout() {
    try {
      const res = await authorizedFetch(`/oauth/logout`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        console.error("Logout failed", await res.text());
      }
    } catch (err) {
      console.error("Logout error", err);
    } finally {
      window.location.href = "/";
    }
  };
}
