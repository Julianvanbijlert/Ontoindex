import { describe, expect, it } from "vitest";

import {
  dedupeSearchHistory,
  filterAndSortSearchResults,
} from "@/lib/search-service";

describe("search-service", () => {
  it("deduplicates search history by normalized query and keeps the newest entry first", () => {
    const result = dedupeSearchHistory([
      { id: "1", query: " Ontology Search ", created_at: "2026-03-19T08:00:00.000Z" },
      { id: "2", query: "ontology   search", created_at: "2026-03-19T09:00:00.000Z" },
      { id: "3", query: "Definition", created_at: "2026-03-19T07:00:00.000Z" },
    ]);

    expect(result.map((entry) => entry.id)).toEqual(["2", "3"]);
  });

  it("filters by ontology and tag while keeping ontology results in scope", () => {
    const definitions = [
      {
        id: "def-1",
        title: "Authentication Token",
        description: "Definition in ontology one",
        content: "",
        ontology_id: "onto-1",
        priority: "high",
        status: "approved",
        tags: ["security"],
        updated_at: "2026-03-19T09:00:00.000Z",
        view_count: 8,
        ontologies: { id: "onto-1", title: "Security Ontology" },
      },
      {
        id: "def-2",
        title: "Customer Record",
        description: "Definition in ontology two",
        content: "",
        ontology_id: "onto-2",
        priority: "normal",
        status: "approved",
        tags: ["crm"],
        updated_at: "2026-03-19T08:00:00.000Z",
        view_count: 5,
        ontologies: { id: "onto-2", title: "CRM Ontology" },
      },
    ];

    const ontologies = [
      {
        id: "onto-1",
        title: "Security Ontology",
        description: "Ontology result",
        status: "approved",
        tags: ["security"],
        updated_at: "2026-03-19T07:00:00.000Z",
        view_count: 12,
      },
      {
        id: "onto-2",
        title: "CRM Ontology",
        description: "Another ontology result",
        status: "approved",
        tags: ["crm"],
        updated_at: "2026-03-19T06:00:00.000Z",
        view_count: 20,
      },
    ];

    const result = filterAndSortSearchResults(
      definitions,
      ontologies,
      "",
      {
        ontologyId: "onto-1",
        tag: "security",
        status: "all",
        type: "all",
      },
      "views",
    );

    expect(result.map((item) => `${item.type}:${item.id}`)).toEqual([
      "ontology:onto-1",
      "definition:def-1",
    ]);
  });

  it("sorts mixed results by relevance when the query matches the title", () => {
    const result = filterAndSortSearchResults(
      [
        {
          id: "def-1",
          title: "API Gateway",
          description: "Gateway definition",
          content: "",
          ontology_id: "onto-1",
          priority: "normal",
          status: "approved",
          tags: ["integration"],
          updated_at: "2026-03-19T09:00:00.000Z",
          view_count: 3,
          ontologies: { id: "onto-1", title: "Platform Ontology" },
        },
      ],
      [
        {
          id: "onto-1",
          title: "Gateway Models",
          description: "Ontology",
          status: "approved",
          tags: ["integration"],
          updated_at: "2026-03-19T08:00:00.000Z",
          view_count: 50,
        },
      ],
      "api gateway",
      {
        ontologyId: "all",
        tag: "all",
        status: "all",
        type: "all",
      },
      "relevance",
    );

    expect(result[0]).toMatchObject({
      type: "definition",
      id: "def-1",
    });
  });
});

