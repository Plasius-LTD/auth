import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuthorizedFetch } from "../lib/authorizedFetch.js";
import {
  createLegacySelfIdentity,
  parseAuthMeResponse,
  type ActorSubjectPrincipal,
  type PrincipalReference,
} from "./principals.js";

const EMPTY_IDENTITY = {
  userId: null,
  principal: null,
} as const;

export interface AuthContextType {
  /** Backwards-compatible alias for the authenticated actor account ID. */
  userId: string | null;
  /** Server-authoritative authenticated actor. */
  actor: PrincipalReference | null;
  /** Server-authoritative effective subject; never selected locally. */
  subject: PrincipalReference | null;
  /** Validated actor/subject and delegated authorization context. */
  principal: ActorSubjectPrincipal | null;
  setUserId: (userId: string | null) => void;
  validateSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const authorizedFetch = useAuthorizedFetch();
  const [identity, setIdentity] = useState<{
    userId: string | null;
    principal: ActorSubjectPrincipal | null;
  }>(EMPTY_IDENTITY);
  const validateSessionPromise = useRef<Promise<void> | null>(null);
  const isMounted = useRef(false);

  const setUserId = useCallback((userId: string | null): void => {
    if (userId === null) {
      setIdentity(EMPTY_IDENTITY);
      return;
    }

    setIdentity(createLegacySelfIdentity(userId) ?? EMPTY_IDENTITY);
  }, []);

  const validateSession = useCallback((): Promise<void> => {
    if (validateSessionPromise.current) return validateSessionPromise.current;

    const validation = (async () => {
      try {
        const res = await authorizedFetch(`/oauth/me`);
        if (!res.ok) throw new Error("Invalid session");

        const data: unknown = await res.json();
        const parsed = parseAuthMeResponse(data);
        if (!parsed) throw new Error("Invalid session response");

        if (isMounted.current) setIdentity(parsed);
      } catch {
        if (isMounted.current) setIdentity(EMPTY_IDENTITY);
      } finally {
        validateSessionPromise.current = null;
      }
    })();

    validateSessionPromise.current = validation;
    return validation;
  }, [authorizedFetch]);

  useEffect(() => {
    isMounted.current = true;
    void validateSession();

    return () => {
      isMounted.current = false;
    };
  }, [validateSession]);

  const actor = identity.principal?.actor ?? null;
  const subject = identity.principal?.subject ?? null;

  return (
    <AuthContext.Provider
      value={{
        userId: identity.userId,
        actor,
        subject,
        principal: identity.principal,
        setUserId,
        validateSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

export * from "./principals.js";
