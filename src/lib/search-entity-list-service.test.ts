import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  fetchDefinitionsForBrowsePage,
  fetchOntologiesForBrowsePage,
} from "@/lib/search-entity-list-service";

const { normalizeSearchQuery, searchEntities } = vi.hoisted(() => ({
  searchEntities: vi.fn(),
  normalizeSearchQuery: vi.fn((query: string) => query.trim().replace(/\s+/g, " ").toLowerCase()),
}));

vi.mock("@/lib/search-service", () => ({
  normalizeSearchQuery,
  searchEntities,
}));

function createClientMock() {
  return {
    from: vi.fn((table: string) => {
      if (table === "definitions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({
                data: [
                  { id: "def-1", title: "API Gateway", updated_at: "2026-03-24T10:00:00.000Z" },
                ],
                error: null,
              })),
            })),
            in: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({
                data: [
                  { id: "def-2", title: "Second", updated_at: "2026-03-24T09:00:00.000Z" },
                  { id: "def-1", title: "First", updated_at: "2026-03-24T10:00:00.000Z" },
                ],
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "ontologies") {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({
              data: [
                { id: "onto-1", title: "Security", updated_at: "2026-03-24T10:00:00.000Z" },
              ],
              error: null,
            })),
            in: vi.fn(() => Promise.resolve({
              data: [
                { id: "onto-2", title: "Second", updated_at: "2026-03-24T09:00:00.000Z" },
                { id: "onto-1", title: "First", updated_at: "2026-03-24T10:00:00.000Z" },
              ],
              error: null,
            })),
          })),
        };
      }

      throw new Error(`Unexpected table lookup: ${table}`);
    }),
  } as unknown as Parameters<typeof fetchDefinitionsForBrowsePage>[0];
}

describe("search-entity-list-service", () => {
  beforeEach(() => {
    searchEntities.mockReset();
  });

  it("keeps lightweight database browsing for definitions when the query is empty", async () => {
    const client = createClientMock();

    const results = await fetchDefinitionsForBrowsePage(client, {
      query: "   ",
      statusFilter: "all",
      ontologyFilter: "all",
      currentUserId: "user-1",
    });

    expect(searchEntities).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("def-1");
  });

  it("uses the retrieval gateway for definition search and preserves ranked order", async () => {
    const client = createClientMock();
    searchEntities.mockResolvedValue([
      { id: "def-1", type: "definition" },
      { id: "def-2", type: "definition" },
    ]);

    const results = await fetchDefinitionsForBrowsePage(client, {
      query: "gateway",
      statusFilter: "approved",
      ontologyFilter: "onto-1",
      currentUserId: "user-1",
    });

    expect(searchEntities).toHaveBeenCalledWith(
      client,
      "gateway",
      {
        ontologyId: "onto-1",
        tag: "all",
        status: "approved",
        type: "definition",
        ownership: "all",
      },
      "relevance",
      "user-1",
    );
    expect(results.map((result) => result.id)).toEqual(["def-1", "def-2"]);
  });

  it("uses the retrieval gateway for ontology search and preserves ranked order", async () => {
    const client = createClientMock();
    searchEntities.mockResolvedValue([
      { id: "onto-1", type: "ontology", title: "First", description: "", status: "approved", tags: [], updatedAt: "2026-03-24T10:00:00.000Z", viewCount: 1, relevance: 1 },
      { id: "onto-2", type: "ontology", title: "Second", description: "", status: "approved", tags: [], updatedAt: "2026-03-24T09:00:00.000Z", viewCount: 1, relevance: 0.5 },
    ]);

    const results = await fetchOntologiesForBrowsePage(client, {
      query: "security",
      currentUserId: "user-1",
    });

    expect(searchEntities).toHaveBeenCalledWith(
      client,
      "security",
      {
        ontologyId: "all",
        tag: "all",
        status: "all",
        type: "ontology",
        ownership: "all",
      },
      "relevance",
      "user-1",
    );
    expect(results.map((result) => result.id)).toEqual(["onto-1", "onto-2"]);
  });
});
