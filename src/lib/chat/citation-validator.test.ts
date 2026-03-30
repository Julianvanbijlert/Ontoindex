import { describe, expect, it } from "vitest";

import { validateGroundedAnswer } from "@/lib/chat/citation-validator";

describe("validateGroundedAnswer", () => {
  const evidencePack = [
    {
      citationId: "E1",
      entityId: "definition-1",
      entityType: "definition" as const,
      title: "Employee",
      snippet: "An employee is a worker hired by an organization.",
      href: "/definitions/definition-1",
      score: 0.99,
      provenance: {
        retrievalStrategy: "hybrid" as const,
        matchReasons: ["Exact title match"],
        appliedFilters: [],
        appliedBoosts: [],
        synonymExpansion: ["worker"],
        relationPath: null,
      },
      safety: {
        isDeleted: false,
        tombstoneDetected: false,
      },
    },
  ];

  it("keeps valid citations and answer text", () => {
    const result = validateGroundedAnswer({
      answer: "Employee is the current term. [E1]",
      citations: ["E1"],
    }, evidencePack, true);

    expect(result.grounded).toBe(true);
    expect(result.validCitations).toEqual(["E1"]);
    expect(result.invalidCitations).toEqual([]);
    expect(result.text).toContain("Employee is the current term.");
  });

  it("falls back in strict mode when only invalid citations exist", () => {
    const result = validateGroundedAnswer({
      answer: "Employee is the current term. [E9]",
      citations: ["E9"],
    }, evidencePack, true);

    expect(result.grounded).toBe(false);
    expect(result.validCitations).toEqual([]);
    expect(result.invalidCitations).toEqual(["E9"]);
    expect(result.fallbackText).toContain("couldn't ground");
  });
});
