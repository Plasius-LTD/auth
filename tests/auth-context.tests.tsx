// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authorizedFetchMock } = vi.hoisted(() => ({
  authorizedFetchMock: vi.fn(),
}));

vi.mock("../src/lib/authorizedFetch.js", () => ({
  useAuthorizedFetch: () => authorizedFetchMock,
}));

import {
  AuthProvider,
  parseAuthMeResponse,
  useAuth,
  type ActorSubjectPrincipal,
} from "../src/components/AuthContext.js";

const NOW = Date.parse("2026-07-15T12:00:00.000Z");
const AUTHENTICATED_AT = "2026-07-15T11:00:00.000Z";
const ASSERTED_AT = "2026-07-15T10:00:00.000Z";
const EXPIRES_AT = "2099-07-15T10:00:00.000Z";

function delegatedPrincipal(
  overrides: Partial<ActorSubjectPrincipal> = {},
): ActorSubjectPrincipal {
  return {
    actor: {
      accountId: "guardian-account-001",
      accountType: "user",
    },
    subject: {
      accountId: "managed-child-001",
      accountType: "managed-child",
    },
    principalType: "guardian-delegated",
    relationshipId: "guardian-relationship-001",
    authorizationVersion: 0,
    ageBand: "6-9",
    assurance: {
      level: "guardian-attested",
      method: "guardian-attestation",
      assertedAt: ASSERTED_AT,
      expiresAt: EXPIRES_AT,
      evidenceRef: "age-evidence-001",
    },
    authenticatedAt: AUTHENTICATED_AT,
    ...overrides,
  };
}

function response(payload: unknown, ok = true): Response {
  return {
    ok,
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

function AuthProbe() {
  const { actor, principal, setUserId, subject, userId, validateSession } = useAuth();

  return (
    <>
      <output data-testid="user-id">{userId ?? "anonymous"}</output>
      <output data-testid="actor-id">{actor?.accountId ?? "none"}</output>
      <output data-testid="subject-id">{subject?.accountId ?? "none"}</output>
      <output data-testid="principal-type">
        {principal?.principalType ?? "none"}
      </output>
      <button type="button" onClick={() => setUserId("manual-user-001")}>
        Set legacy user
      </button>
      <button type="button" onClick={() => void validateSession()}>
        Validate
      </button>
    </>
  );
}

function renderedText(testId: string): string | null {
  return screen.getByTestId(testId).textContent;
}

describe("parseAuthMeResponse", () => {
  it("synthesizes a self principal for the legacy userId response", () => {
    const parsed = parseAuthMeResponse({ userId: "user_123" }, NOW);

    expect(parsed).toEqual({
      userId: "user_123",
      principal: {
        actor: { accountId: "user_123", accountType: "user" },
        subject: { accountId: "user_123", accountType: "user" },
        principalType: "self",
        authenticatedAt: "2026-07-15T12:00:00.000Z",
      },
    });
    expect(JSON.parse(JSON.stringify(parsed))).toHaveProperty("userId", "user_123");
  });

  it("validates and minimizes a delegated principal", () => {
    const principal = {
      ...delegatedPrincipal(),
      roles: ["finance-management"],
      assurance: {
        ...delegatedPrincipal().assurance,
        dateOfBirth: "2018-01-01",
        providerPayload: "must-not-be-retained",
      },
    };

    const parsed = parseAuthMeResponse(
      {
        userId: "guardian-account-001",
        principal,
      },
      NOW,
    );

    expect(parsed?.userId).toBe("guardian-account-001");
    expect(parsed?.principal).toEqual(delegatedPrincipal());
    expect(parsed?.principal).not.toHaveProperty("roles");
    expect(parsed?.principal.assurance).not.toHaveProperty("dateOfBirth");
    expect(parsed?.principal.assurance).not.toHaveProperty("providerPayload");
  });

  it("accepts matching optional age assurance on a self principal", () => {
    const parsed = parseAuthMeResponse(
      {
        principal: {
          actor: { accountId: "adult-001", accountType: "user" },
          subject: { accountId: "adult-001", accountType: "user" },
          principalType: "self",
          ageBand: "18+",
          assurance: {
            level: "verified",
            method: "manual-review",
            assertedAt: ASSERTED_AT,
          },
          authenticatedAt: AUTHENTICATED_AT,
        },
      },
      NOW,
    );

    expect(parsed?.principal.ageBand).toBe("18+");
    expect(parsed?.principal.assurance?.method).toBe("manual-review");
  });

  it("accepts minimized provider verification after internal evidence is stripped", () => {
    const parsed = parseAuthMeResponse(
      {
        principal: delegatedPrincipal({
          assurance: {
            level: "verified",
            method: "verified-provider",
            assertedAt: ASSERTED_AT,
            expiresAt: EXPIRES_AT,
          },
        }),
      },
      NOW,
    );

    expect(parsed?.principal.assurance).toEqual({
      level: "verified",
      method: "verified-provider",
      assertedAt: ASSERTED_AT,
      expiresAt: EXPIRES_AT,
    });
  });

  it("accepts one plural alias and identical singular/plural values", () => {
    const principal = delegatedPrincipal();

    expect(parseAuthMeResponse({ principals: [principal] }, NOW)?.principal).toEqual(
      principal,
    );
    expect(
      parseAuthMeResponse({ principal, principals: principal }, NOW)?.principal,
    ).toEqual(principal);
  });

  it("fails closed when singular and plural principals disagree", () => {
    const principal = delegatedPrincipal();

    expect(
      parseAuthMeResponse(
        {
          principal,
          principals: {
            ...principal,
            authorizationVersion: 1,
          },
        },
        NOW,
      ),
    ).toBeNull();
    expect(parseAuthMeResponse({ principals: [principal, principal] }, NOW)).toBeNull();
  });

  it("fails closed when legacy userId does not match the actor", () => {
    expect(
      parseAuthMeResponse(
        {
          userId: "different-user",
          principal: delegatedPrincipal(),
        },
        NOW,
      ),
    ).toBeNull();
  });

  it.each([
    [
      "self subject switching",
      {
        actor: { accountId: "adult-001", accountType: "user" },
        subject: { accountId: "adult-002", accountType: "user" },
        principalType: "self",
        authenticatedAt: AUTHENTICATED_AT,
      },
    ],
    ["missing relationship", delegatedPrincipal({ relationshipId: undefined })],
    ["negative authorization version", delegatedPrincipal({ authorizationVersion: -1 })],
    ["fractional authorization version", delegatedPrincipal({ authorizationVersion: 1.5 })],
    [
      "unsafe authorization version",
      delegatedPrincipal({ authorizationVersion: Number.MAX_SAFE_INTEGER + 1 }),
    ],
    ["adult delegated subject", delegatedPrincipal({ ageBand: "18+" })],
    [
      "future authentication time",
      delegatedPrincipal({ authenticatedAt: "2026-07-15T12:00:00.001Z" }),
    ],
    [
      "malformed authentication time",
      delegatedPrincipal({ authenticatedAt: "15 July 2026" }),
    ],
    [
      "assurance after authentication",
      delegatedPrincipal({
        assurance: {
          level: "guardian-attested",
          method: "guardian-attestation",
          assertedAt: "2026-07-15T11:00:00.001Z",
          expiresAt: EXPIRES_AT,
        },
      }),
    ],
    [
      "expired assurance",
      delegatedPrincipal({
        assurance: {
          level: "guardian-attested",
          method: "guardian-attestation",
          assertedAt: "2026-07-14T10:00:00.000Z",
          expiresAt: "2026-07-15T11:59:59.999Z",
        },
      }),
    ],
    [
      "unknown assurance level",
      delegatedPrincipal({
        assurance: {
          level: "unknown" as never,
          method: "guardian-attestation",
          assertedAt: ASSERTED_AT,
        },
      }),
    ],
    [
      "unknown assurance method",
      delegatedPrincipal({
        assurance: {
          level: "guardian-attested",
          method: "unknown" as never,
          assertedAt: ASSERTED_AT,
        },
      }),
    ],
    [
      "mismatched assurance level and method",
      delegatedPrincipal({
        assurance: {
          level: "verified",
          method: "guardian-attestation",
          assertedAt: ASSERTED_AT,
        },
      }),
    ],
    [
      "self-asserted delegated age",
      delegatedPrincipal({
        assurance: {
          level: "self-asserted",
          method: "self-assertion",
          assertedAt: ASSERTED_AT,
        },
      }),
    ],
  ])("rejects malformed principals: %s", (_label, principal) => {
    expect(parseAuthMeResponse({ principal }, NOW)).toBeNull();
  });

  it("rejects malformed response containers and identifiers", () => {
    expect(parseAuthMeResponse(null, NOW)).toBeNull();
    expect(parseAuthMeResponse([], NOW)).toBeNull();
    expect(parseAuthMeResponse({}, NOW)).toBeNull();
    expect(parseAuthMeResponse({ userId: "  " }, NOW)).toBeNull();
    expect(parseAuthMeResponse({ principal: undefined }, NOW)).toBeNull();
    expect(parseAuthMeResponse({ principals: [] }, NOW)).toBeNull();
  });
});

describe("AuthProvider", () => {
  beforeEach(() => {
    authorizedFetchMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("preserves legacy context behavior and exposes synthesized self references", async () => {
    authorizedFetchMock.mockResolvedValueOnce(response({ userId: "legacy-user-001" }));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(renderedText("user-id")).toBe("legacy-user-001"));
    expect(renderedText("actor-id")).toBe("legacy-user-001");
    expect(renderedText("subject-id")).toBe("legacy-user-001");
    expect(renderedText("principal-type")).toBe("self");
  });

  it("exposes delegated actor and subject without adding browser-selected headers", async () => {
    authorizedFetchMock.mockResolvedValueOnce(
      response({
        userId: "guardian-account-001",
        principal: delegatedPrincipal({
          authenticatedAt: "2020-07-15T11:00:00.000Z",
          assurance: {
            level: "guardian-attested",
            method: "guardian-attestation",
            assertedAt: "2020-07-15T10:00:00.000Z",
            expiresAt: EXPIRES_AT,
          },
        }),
      }),
    );

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(renderedText("subject-id")).toBe("managed-child-001"),
    );
    expect(renderedText("user-id")).toBe("guardian-account-001");
    expect(renderedText("actor-id")).toBe("guardian-account-001");
    expect(renderedText("principal-type")).toBe("guardian-delegated");
    expect(authorizedFetchMock).toHaveBeenCalledWith("/oauth/me");
  });

  it("keeps setUserId as a compatible actor setter", async () => {
    authorizedFetchMock.mockResolvedValueOnce(response({}, false));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(authorizedFetchMock).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Set legacy user" }));

    expect(renderedText("user-id")).toBe("manual-user-001");
    expect(renderedText("actor-id")).toBe("manual-user-001");
    expect(renderedText("subject-id")).toBe("manual-user-001");
  });

  it("clears existing state when a new response mismatches actor and userId", async () => {
    authorizedFetchMock
      .mockResolvedValueOnce(response({ userId: "legacy-user-001" }))
      .mockResolvedValueOnce(
        response({
          userId: "mismatched-user",
          principal: delegatedPrincipal({
            authenticatedAt: "2020-07-15T11:00:00.000Z",
            assurance: {
              level: "guardian-attested",
              method: "guardian-attestation",
              assertedAt: "2020-07-15T10:00:00.000Z",
              expiresAt: EXPIRES_AT,
            },
          }),
        }),
      );

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(renderedText("user-id")).toBe("legacy-user-001"));
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    await waitFor(() => expect(renderedText("user-id")).toBe("anonymous"));
    expect(renderedText("actor-id")).toBe("none");
    expect(renderedText("subject-id")).toBe("none");
  });

  it("deduplicates concurrent session validation inside one provider", async () => {
    let resolveResponse: ((value: Response) => void) | undefined;
    authorizedFetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }),
    );

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    expect(authorizedFetchMock).toHaveBeenCalledOnce();

    resolveResponse?.(response({ userId: "legacy-user-001" }));
    await waitFor(() => expect(renderedText("user-id")).toBe("legacy-user-001"));
  });

  it("requires useAuth consumers to be nested inside AuthProvider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => render(<AuthProbe />)).toThrow(
      "useAuth must be used within AuthProvider",
    );

    consoleError.mockRestore();
  });
});
