import { describe, it, expect, beforeEach, vi } from "vitest";
import { createAuthorizedFetch } from "../src/lib/authorizedFetch.js";

describe("authorizedFetch", () => {
  const fetchMock = vi.fn();
  global.fetch = fetchMock;

  beforeEach(() => {
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

  it("refreshes and retries after a 401", async () => {
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
    expect(fetchMock.mock.calls[2][1]?.headers).toMatchObject({
      "x-csrf-token": "xyz",
    });
  });

  it("deduplicates refresh calls", async () => {
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
});
