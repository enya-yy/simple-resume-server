import { describe, expect, it } from "vitest";

import { JobTimeoutError, withTimeout } from "./job-timeout.js";

describe("withTimeout", () => {
  it("resolves when promise finishes before timeout", async () => {
    const result = await withTimeout(Promise.resolve("ok"), 1000, "job-1");
    expect(result).toBe("ok");
  });

  it("rejects with JobTimeoutError when promise exceeds timeout", async () => {
    const slow = new Promise<string>((resolve) =>
      setTimeout(() => resolve("late"), 500),
    );
    await expect(withTimeout(slow, 10, "job-2")).rejects.toThrow(
      JobTimeoutError,
    );
  });

  it("propagates the original error when promise rejects before timeout", async () => {
    const failing = Promise.reject(new Error("db down"));
    await expect(withTimeout(failing, 5000, "job-3")).rejects.toThrow(
      "db down",
    );
  });
});

describe("JobTimeoutError", () => {
  it("has the correct name and message", () => {
    const err = new JobTimeoutError("abc-123");
    expect(err.name).toBe("JobTimeoutError");
    expect(err.message).toContain("abc-123");
    expect(err).toBeInstanceOf(Error);
  });
});
