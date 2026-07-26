import type {
  ActorSubjectPrincipal,
  AuthContextType,
  AuthSessionIdentity,
} from "../src/index.js";

declare const principal: ActorSubjectPrincipal;

// This is the exact structural AuthContext shape published in v1.0.20. A
// minor release must continue accepting it without new identity properties.
const prePhasedContextMock: AuthContextType = {
  userId: "account-001",
  setUserId: () => undefined,
  validateSession: async () => undefined,
};

// AuthSessionIdentity was introduced with actor/subject principals before the
// phased-authority metadata was added. Those later fields remain additive.
const prePhasedSessionMock: AuthSessionIdentity = {
  userId: "account-001",
  principal,
};

void prePhasedContextMock;
void prePhasedSessionMock;
