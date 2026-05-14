import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DashScopeRequestError,
  completeDashScopeChat,
  getDashScopeEnv,
} from "./bailian-dashscope-chat.js";

describe("getDashScopeEnv", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it("returns default base URL and model when unset", () => {
    delete process.env.DASHSCOPE_API_KEY;
    delete process.env.DASHSCOPE_MODEL;
    delete process.env.DASHSCOPE_BASE_URL;
    const env = getDashScopeEnv();
    expect(env.apiKey).toBeUndefined();
    expect(env.model).toBe("qwen-turbo");
    expect(env.baseUrl).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1");
  });
});

describe("completeDashScopeChat", () => {
  it("parses assistant content from JSON response", async () => {
    const payload = JSON.stringify({
      choices: [{ message: { content: "  建议正文  " } }],
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => payload,
    });
    vi.stubGlobal("fetch", fetchMock);

    const text = await completeDashScopeChat({
      apiKey: "k",
      model: "qwen-turbo",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      systemPrompt: "sys",
      userContent: "usr",
    });

    expect(text).toBe("建议正文");
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1].body as string) as {
      model: string;
      stream: boolean;
    };
    expect(body.model).toBe("qwen-turbo");
    expect(body.stream).toBe(false);
  });

  it("throws DashScopeRequestError on HTTP 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () =>
        JSON.stringify({ error: { message: "invalid", code: "invalid_api_key" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      completeDashScopeChat({
        apiKey: "bad",
        model: "qwen-turbo",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        systemPrompt: "s",
        userContent: "u",
      }),
    ).rejects.toMatchObject({
      name: "DashScopeRequestError",
      httpStatus: 401,
    });
  });

  it("maps 400 model errors to configuration hint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          error: { code: "InvalidParameter", message: "model not found" },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await completeDashScopeChat({
        apiKey: "k",
        model: "bad-model",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        systemPrompt: "s",
        userContent: "u",
      });
      expect.fail("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(DashScopeRequestError);
      expect((e as DashScopeRequestError).userHint).toContain("DASHSCOPE_MODEL");
    }
  });
});
