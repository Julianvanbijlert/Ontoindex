import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildLmStudioDevCheckMessage } from "../../../scripts/lmstudio-check-lib.mjs";

describe("lmstudio dev helper", () => {
  it("prints a clear warning and instruction when LM Studio is not reachable", () => {
    const message = buildLmStudioDevCheckMessage({
      ok: false,
      baseUrl: "http://localhost:1234/v1",
      message: "LM Studio is unreachable at http://localhost:1234/v1/models.",
      modelIds: [],
    });

    expect(message).toContain("LM Studio check failed");
    expect(message).toContain("Start LM Studio");
    expect(message).toContain("http://localhost:1234/v1");
  });

  it("keeps npm run dev independent and exposes a separate ai:check helper script", () => {
    const packageJson = JSON.parse(
      readFileSync("package.json", "utf8"),
    ) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.dev).toBe("vite");
    expect(packageJson.scripts?.["ai:check"]).toBe("node scripts/lmstudio-check.mjs");
  });
});
