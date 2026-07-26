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
  authoritySource: null,
  principalContractVersion: null,
  userIdKind: null,
} as const;

export interface AuthContextType {
  /** Backwards-compatible login/storage ID; may be a versioned legacy alias. */
  userId: string | null;
  /** Additive actor reference; require `server-principal` before authorizing it. */
  readonly actor?: PrincipalReference | null;
  /** Additive subject reference; require `server-principal` before authorizing it. */
  readonly subject?: PrincipalReference | null;
  /** Additive actor/subject context, including compatibility-only legacy synthesis. */
  readonly principal?: ActorSubjectPrincipal | null;
  /**
   * Additive phased-authority metadata. Token/family consumers must require the
   * exact `server-principal` value; absence is non-authoritative.
   */
  readonly authoritySource?:
    | "server-principal"
    | "legacy-synthesized"
    | null;
  readonly principalContractVersion?: 2 | null;
  readonly userIdKind?: "legacy-storage-owner" | null;
  setUserId: (userId: string | null) => void;
  validateSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const authorizedFetch = useAuthorizedFetch();
  const [identity, setIdentity] = useState<{
    userId: string | null;
    principal: ActorSubjectPrincipal | null;
    authoritySource: "server-principal" | "legacy-synthesized" | null;
    principalContractVersion: 2 | null;
    userIdKind: "legacy-storage-owner" | null;
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
        authoritySource: identity.authoritySource,
        actor,
        subject,
        principal: identity.principal,
        principalContractVersion: identity.principalContractVersion,
        userIdKind: identity.userIdKind,
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
