import { describe, it, expect, beforeEach, vi } from "vitest";

let createAuthorizedFetch: typeof import("../src/lib/authorizedFetch.js").createAuthorizedFetch;
let parseRetryAfterMs: typeof import("../src/lib/authorizedFetch.js").parseRetryAfterMs;

const fetchMock = vi.fn();
global.fetch = fetchMock;

describe("authorizedFetch", () => {
  beforeEach(async () => {
    vi.resetModules();
    ({ createAuthorizedFetch, parseRetryAfterMs } = await import("../src/lib/authorizedFetch.js"));
    fetchMock.mockReset();
    globalThis.document = { cookie: "" } as unknown as { cookie: string };
  });

  it("parses RFC 9110 Retry-After grammar strictly and caps waits", () => {
    expect(parseRetryAfterMs("120")).toBe(120_000);
    expect(parseRetryAfterMs("120junk")).toBeNull();
    expect(parseRetryAfterMs("1.5")).toBeNull();
    expect(parseRetryAfterMs("999999")).toBe(300_000);
  });

  it("adds csrf token header when cookie present", async () => {
    globalThis.document = {
      cookie: "csrf-token=abc123",
    } as unknown as { cookie: string };

    fetchMock.mockResolvedValueOnce(new Response("ok"));

    const authorizedFetch = createAuthorizedFetch();
    await authorizedFetch("/test");

    expect(fetchMock).toHaveBeenCalledOnce();
    const sentHeaders = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(sentHeaders.get("x-csrf-token")).toBe("abc123");
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe("include");
  });

  it("preserves a caller-owned Headers instance without mutating it", async () => {
    globalThis.document = {
      cookie: "csrf-token=server-cookie-token",
    } as unknown as { cookie: string };

    const callerHeaders = new Headers({
      "Content-Type": "application/json",
      "Idempotency-Key": "family-command-1",
      "x-csrf-token": "caller-token",
    });
    fetchMock.mockResolvedValueOnce(new Response("ok"));

    const authorizedFetch = createAuthorizedFetch();
    await authorizedFetch("/test", { headers: callerHeaders });

    const sentHeaders = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(sentHeaders.get("content-type")).toBe("application/json");
    expect(sentHeaders.get("idempotency-key")).toBe("family-command-1");
    expect(sentHeaders.get("x-csrf-token")).toBe("server-cookie-token");
    expect(callerHeaders.get("x-csrf-token")).toBe("caller-token");
  });

  it.each([
    {
      name: "tuple-array",
      headers: [
        ["Content-Type", "application/json"],
        ["X-Correlation-Id", "correlation-1"],
      ] as [string, string][],
    },
    {
      name: "plain-object",
      headers: {
        "Content-Type": "application/json",
        "X-Correlation-Id": "correlation-1",
      },
    },
  ])("preserves $name header initializers", async ({ headers }) => {
    fetchMock.mockResolvedValueOnce(new Response("ok"));

    const authorizedFetch = createAuthorizedFetch();
    await authorizedFetch("/test", { headers });

    const sentHeaders = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(sentHeaders.get("content-type")).toBe("application/json");
    expect(sentHeaders.get("x-correlation-id")).toBe("correlation-1");
  });

  it("refreshes and retries once after a 401", async () => {
    globalThis.document = {
      cookie: "csrf-token=xyz",
    } as unknown as { cookie: string };

    fetchMock
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const authorizedFetch = createAuthorizedFetch();
    const response = await authorizedFetch("/test");

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe("/oauth/refresh-token");
    expect(
      new Headers(fetchMock.mock.calls[1][1]?.headers).get("x-csrf-token")
    ).toBe("xyz");
    expect(
      new Headers(fetchMock.mock.calls[2][1]?.headers).get("x-csrf-token")
    ).toBe("xyz");
  });

  it("stops after one refresh attempt when request still returns 401", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(new Response("still unauthorized", { status: 401 }));

    const authorizedFetch = createAuthorizedFetch();
    const response = await authorizedFetch("/test");

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe("/oauth/refresh-token");
  });

  it("deduplicates refresh calls for concurrent requests", async () => {
    globalThis.document = {
      cookie: "csrf-token=dedupe",
    } as unknown as { cookie: string };

    fetchMock
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValue(new Response("ok", { status: 200 }));

    const authorizedFetch = createAuthorizedFetch();

    await Promise.all([
      authorizedFetch("/a"),
      authorizedFetch("/b"),
      authorizedFetch("/c"),
    ]);

    const refreshCalls = fetchMock.mock.calls.filter(([url]) =>
      url.toString().includes("/oauth/refresh-token")
    );

    expect(refreshCalls.length).toBe(1);
  });

  it("enters cooldown after refresh failure and avoids repeated refresh spam", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);

    fetchMock
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response("service unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("unauthorized again", { status: 401 }));

    const authorizedFetch = createAuthorizedFetch();

    const first = await authorizedFetch("/first");
    const second = await authorizedFetch("/second");

    expect(first.status).toBe(401);
    expect(second.status).toBe(401);

    const refreshCalls = fetchMock.mock.calls.filter(([url]) =>
      url.toString().includes("/oauth/refresh-token")
    );
    expect(refreshCalls.length).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(randomSpy).toHaveBeenCalled();

    randomSpy.mockRestore();
  });
});
