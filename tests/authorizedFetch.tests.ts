import { describe, it, expect, beforeEach, vi } from "vitest";

let createAuthorizedFetch: typeof import("../src/lib/authorizedFetch.js").createAuthorizedFetch;

const fetchMock = vi.fn();
global.fetch = fetchMock;

describe("authorizedFetch", () => {
  beforeEach(async () => {
    vi.resetModules();
    ({ createAuthorizedFetch } = await import("../src/lib/authorizedFetch.js"));
    fetchMock.mockReset();
    globalThis.document = { cookie: "" } as unknown as { cookie: string };
  });

  it("adds csrf token header when cookie present", async () => {
    globalThis.document = {
      cookie: "csrf-token=abc123",
    } as unknown as { cookie: string };

    fetchMock.mockResolvedValueOnce(new Response("ok"));

    const authorizedFetch = createAuthorizedFetch();
    await authorizedFetch("/test");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      "x-csrf-token": "abc123",
    });
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe("include");
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
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
      "x-csrf-token": "xyz",
    });
    expect(fetchMock.mock.calls[2][1]?.headers).toMatchObject({
      "x-csrf-token": "xyz",
    });
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
