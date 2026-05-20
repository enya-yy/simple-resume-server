import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveChatAssistLlmEnv } from "./contracts/index.js";
import { OpenAiChatRequestError, completeOpenAiChatCompletion } from "./bailian-dashscope-chat.js";

describe("resolveChatAssistLlmEnv", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it("returns null when stub", () => {
    process.env.LLM_PROVIDER = "stub";
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DASHSCOPE_API_KEY;
    expect(resolveChatAssistLlmEnv(process.env)).toBeNull();
  });

  it("prefers DeepSeek when both keys are set and provider is unset", () => {
    delete process.env.LLM_PROVIDER;
    process.env.DEEPSEEK_API_KEY = "ds";
    process.env.DASHSCOPE_API_KEY = "dq";
    const cfg = resolveChatAssistLlmEnv(process.env);
    expect(cfg?.backend).toBe("deepseek");
    expect(cfg?.apiKey).toBe("ds");
  });

  it("uses dashscope when only dashscope key is set", () => {
    delete process.env.LLM_PROVIDER;
    delete process.env.DEEPSEEK_API_KEY;
    process.env.DASHSCOPE_API_KEY = "dq";
    const cfg = resolveChatAssistLlmEnv(process.env);
    expect(cfg?.backend).toBe("dashscope");
    expect(cfg?.model).toBe("qwen-turbo");
    expect(cfg?.baseUrl).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1");
  });

  it("respects explicit LLM_PROVIDER=dashscope when only deepseek key exists", () => {
    process.env.LLM_PROVIDER = "dashscope";
    process.env.DEEPSEEK_API_KEY = "ds";
    delete process.env.DASHSCOPE_API_KEY;
    expect(resolveChatAssistLlmEnv(process.env)).toBeNull();
  });
});

describe("completeOpenAiChatCompletion", () => {
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

    const text = await completeOpenAiChatCompletion({
      backend: "dashscope",
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

  it("throws OpenAiChatRequestError on HTTP 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () =>
        JSON.stringify({ error: { message: "invalid", code: "invalid_api_key" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      completeOpenAiChatCompletion({
        backend: "dashscope",
        apiKey: "bad",
        model: "qwen-turbo",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        systemPrompt: "s",
        userContent: "u",
      }),
    ).rejects.toMatchObject({
      name: "OpenAiChatRequestError",
      httpStatus: 401,
    });
  });

  it("maps 400 model errors to configuration hint for dashscope", async () => {
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
      await completeOpenAiChatCompletion({
        backend: "dashscope",
        apiKey: "k",
        model: "bad-model",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        systemPrompt: "s",
        userContent: "u",
      });
      expect.fail("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(OpenAiChatRequestError);
      expect((e as OpenAiChatRequestError).userHint).toContain("DASHSCOPE_MODEL");
    }
  });

  it("maps 400 model errors to deepseek env hint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          error: { message: "model not found" },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await completeOpenAiChatCompletion({
        backend: "deepseek",
        apiKey: "k",
        model: "bad",
        baseUrl: "https://api.deepseek.com",
        systemPrompt: "s",
        userContent: "u",
      });
      expect.fail("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(OpenAiChatRequestError);
      expect((e as OpenAiChatRequestError).userHint).toContain("DEEPSEEK_MODEL");
    }
  });
});
