import { describe, expect, it } from "vitest";

import { ruleBasedPolish } from "./polish.worker.js";

describe("ruleBasedPolish", () => {
  it("trims leading/trailing whitespace", () => {
    expect(ruleBasedPolish("  hello world  ")).toBe("hello world");
  });

  it("collapses multiple spaces into one", () => {
    expect(ruleBasedPolish("hello    world")).toBe("hello world");
  });

  it("replaces ASCII comma with Chinese comma", () => {
    expect(ruleBasedPolish("a, b")).toBe("a，b");
  });

  it("replaces trailing ASCII period with Chinese period", () => {
    expect(ruleBasedPolish("hello world.")).toBe("hello world。");
  });

  it("replaces ASCII semicolons with Chinese semicolons", () => {
    expect(ruleBasedPolish("a; b")).toBe("a；b");
  });

  it("replaces ASCII colons with Chinese colons", () => {
    expect(ruleBasedPolish("title: value")).toBe("title：value");
  });

  it("handles multiline input", () => {
    const input = "  line one  \n  line two  ";
    const result = ruleBasedPolish(input);
    expect(result).toBe("line one\nline two");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(ruleBasedPolish("   ")).toBe("");
  });
});

