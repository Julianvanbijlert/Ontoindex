import { describe, expect, it } from "vitest";

import { buildChatEvidencePack } from "@/lib/chat/evidence-pack-builder";

function createEvidenceClient() {
  let definitionStatusFilter: string | null = null;
  let definitionDeletedFilter: boolean | null = null;

  const applyDefinitionFilters = (rows: Array<{ status: string; is_deleted: boolean }>) =>
    rows.filter((row) =>
      (definitionStatusFilter ? row.status === definitionStatusFilter : true)
      && (definitionDeletedFilter === null ? true : row.is_deleted === definitionDeletedFilter));

  const registerDefinitionFilter = (column: string, value: unknown) => {
    if (column === "status") {
      definitionStatusFilter = String(value);
    }

    if (column === "is_deleted") {
      definitionDeletedFilter = Boolean(value);
    }
  };

  return {
    from(table: string) {
      if (table === "definitions") {
        return {
          select() {
            return {
              in() {
                return {
                  eq: (column: string, value: unknown) => {
                    registerDefinitionFilter(column, value);

                    return {
                      eq: (nextColumn: string, nextValue: unknown) => {
                        registerDefinitionFilter(nextColumn, nextValue);

                        return Promise.resolve({
                          data: applyDefinitionFilters([
                            {
                              id: "definition-employee",
                              title: "Employee",
                              description: "A person employed by an organization.",
                              content: "A person employed by an organization.",
                              ontology_id: "ontology-hr",
                              status: "approved",
                              is_deleted: false,
                              ontologies: {
                                title: "HR",
                              },
                            },
                            {
                              id: "definition-draft",
                              title: "Draft term",
                              description: "Should not appear in evidence.",
                              content: "Draft content.",
                              ontology_id: "ontology-hr",
                              status: "draft",
                              is_deleted: false,
                              ontologies: {
                                title: "HR",
                              },
                            },
                          ]),
                          error: null,
                        });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "ontologies") {
        return {
          select() {
            return {
              in: async () => ({
                data: [],
                error: null,
              }),
            };
          },
        };
      }

      return {
        select() {
          return {
            eq() {
              return {
                in: async () => ({
                  data: [{ entity_id: "definition-deleted" }],
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  } as any;
}

describe("buildChatEvidencePack", () => {
  it("filters out tombstoned results and preserves grounded evidence", async () => {
    const result = await buildChatEvidencePack(createEvidenceClient(), {
      synonymSignals: [],
      retrieval: {
        analysis: {} as any,
        diagnostics: {} as any,
        results: [
          {
            id: "definition-employee",
            type: "definition",
            title: "Employee",
            description: "A person employed by an organization.",
            status: "approved",
            updatedAt: "2026-03-26T00:00:00Z",
            viewCount: 10,
            tags: ["hr"],
            ontologyId: "ontology-hr",
            ontologyTitle: "HR",
            relevance: 0.9,
            evidenceExcerpt: "A person employed by an organization.",
            retrievalStrategy: "hybrid",
            matchReasons: ["semantic match"],
            explanation: {
              appliedFilters: [],
              appliedBoosts: [],
            },
          },
          {
            id: "definition-deleted",
            type: "definition",
            title: "Deleted term",
            description: "Should be filtered",
            status: "approved",
            updatedAt: "2026-03-26T00:00:00Z",
            viewCount: 1,
            tags: [],
            relevance: 0.2,
            retrievalStrategy: "hybrid",
          },
          {
            id: "definition-draft",
            type: "definition",
            title: "Draft term",
            description: "Should be filtered",
            status: "draft",
            updatedAt: "2026-03-26T00:00:00Z",
            viewCount: 1,
            tags: [],
            relevance: 0.2,
            retrievalStrategy: "hybrid",
          },
        ],
      } as any,
    });

    expect(result.evidencePack).toHaveLength(1);
    expect(result.evidencePack[0].title).toBe("Employee");
    expect(result.excludedResultCount).toBe(2);
  });

  it("excludes non-definition and non-ontology results from the evidence pack", async () => {
    const result = await buildChatEvidencePack(createEvidenceClient(), {
      synonymSignals: [],
      retrieval: {
        analysis: {} as any,
        diagnostics: {} as any,
        results: [
          {
            id: "comment-1",
            type: "comment",
            title: "Comment",
            description: "Should be ignored",
            status: "approved",
            updatedAt: "2026-03-26T00:00:00Z",
            viewCount: 0,
            tags: [],
            relevance: 0.1,
            retrievalStrategy: "hybrid",
          },
        ],
      } as any,
    });

    expect(result.evidencePack).toHaveLength(0);
    expect(result.excludedResultCount).toBe(1);
  });
});
