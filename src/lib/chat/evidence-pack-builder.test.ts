import { describe, expect, it } from "vitest";

import { buildChatEvidencePack } from "@/lib/chat/evidence-pack-builder";

function createEvidenceClient() {
  return {
    from(table: string) {
      if (table === "definitions") {
        return {
          select() {
            return {
              in() {
                return {
                  eq: async () => ({
                    data: [
                      {
                        id: "definition-employee",
                        title: "Employee",
                        description: "A person employed by an organization.",
                        content: "A person employed by an organization.",
                        ontology_id: "ontology-hr",
                        ontologies: {
                          title: "HR",
                        },
                      },
                    ],
                    error: null,
                  }),
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
        ],
      } as any,
    });

    expect(result.evidencePack).toHaveLength(1);
    expect(result.evidencePack[0].title).toBe("Employee");
    expect(result.excludedResultCount).toBe(1);
  });
});
