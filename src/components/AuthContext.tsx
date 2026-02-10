import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from "react";
import { useAuthorizedFetch } from "../lib/authorizedFetch.js";

let validateSessionPromise: Promise<void> | null = null;

interface AuthContextType {
  userId: string | null;
  setUserId: (userId: string | null) => void;
  validateSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const authorizedFetch = useAuthorizedFetch();
  const [userId, setUserId] = useState<string | null>(null);

  const validateSession = async (): Promise<void> => {
    if (validateSessionPromise) return validateSessionPromise;

    validateSessionPromise = (async () => {
      try {
        console.log("Finding out who we are!");
        const res = await authorizedFetch(`/oauth/me`);
        if (!res.ok) throw new Error("Invalid session");

        const data = await res.json();
        if (data?.userId) {
          console.log(`User found! ${data.userId}`);
          setUserId(data.userId);
        } else {
          setUserId(null);
        }
      } catch {
        setUserId(null);
      } finally {
        validateSessionPromise = null;
      }
    })();
    return validateSessionPromise;
  };

  useEffect(() => {
    validateSession();
  }, []);

  return (
    <AuthContext.Provider value={{ userId, setUserId, validateSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
