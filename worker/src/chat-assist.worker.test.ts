import { describe, expect, it } from "vitest";

import { JobTimeoutError, withTimeout } from "./lib/job-timeout.js";

describe("chat-assist worker timeout handling", () => {
  it("uses JobTimeoutError for long-running work", async () => {
    const slow = new Promise<string>((resolve) =>
      setTimeout(() => resolve("late"), 200),
    );
    await expect(withTimeout(slow, 5, "job-x")).rejects.toThrow(JobTimeoutError);
  });
});
