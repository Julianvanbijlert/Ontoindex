import { describe, expect, it, vi } from "vitest";

import { fetchFavoriteItems, filterAndSortFavorites, toggleFavorite } from "@/lib/favorites-service";

describe("favorites-service", () => {
  it("upserts ontology likes into favorites", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi.fn().mockReturnValue({
        upsert,
      }),
    } as any;

    await toggleFavorite(client, {
      userId: "user-1",
      entityId: "onto-1",
      entityType: "ontology",
      liked: true,
    });

    expect(client.from).toHaveBeenCalledWith("favorites");
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "user-1", ontology_id: "onto-1" },
      { onConflict: "user_id,ontology_id", ignoreDuplicates: false },
    );
  });

  it("maps ontology favorites into the favorites list", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: "fav-1",
          created_at: "2026-03-19T09:00:00.000Z",
          definitions: null,
          ontologies: {
            id: "onto-1",
            title: "Security Ontology",
            description: "Ontology favorite",
            status: "approved",
            updated_at: "2026-03-19T10:00:00.000Z",
            view_count: 12,
            tags: ["security"],
          },
        },
      ],
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const client = {
      from: vi.fn().mockReturnValue({ select }),
    } as any;

    const result = await fetchFavoriteItems(client, "user-1");

    expect(eq).toHaveBeenCalledWith("user_id", "user-1");

    expect(result).toEqual([
      {
        favoriteId: "fav-1",
        entityId: "onto-1",
        entityType: "ontology",
        title: "Security Ontology",
        description: "Ontology favorite",
        status: "approved",
        createdAt: "2026-03-19T09:00:00.000Z",
        updatedAt: "2026-03-19T10:00:00.000Z",
        viewCount: 12,
        tags: ["security"],
        ontologyId: "onto-1",
        ontologyTitle: "Security Ontology",
      },
    ]);
  });

  it("filters and orders favorites by type, tag, and latest update", () => {
    const result = filterAndSortFavorites(
      [
        {
          favoriteId: "fav-1",
          entityId: "def-1",
          entityType: "definition",
          title: "Access Policy",
          description: "Policy",
          status: "approved",
          createdAt: "2026-03-19T08:00:00.000Z",
          updatedAt: "2026-03-19T11:00:00.000Z",
          viewCount: 4,
          tags: ["security"],
          ontologyId: "onto-1",
          ontologyTitle: "Security Ontology",
        },
        {
          favoriteId: "fav-2",
          entityId: "onto-2",
          entityType: "ontology",
          title: "Business Ontology",
          description: "Business",
          status: "draft",
          createdAt: "2026-03-19T09:00:00.000Z",
          updatedAt: "2026-03-19T09:30:00.000Z",
          viewCount: 8,
          tags: ["business"],
          ontologyId: "onto-2",
          ontologyTitle: "Business Ontology",
        },
      ],
      {
        type: "definition",
        ontologyId: "onto-1",
        tag: "security",
        status: "approved",
        sortBy: "updated_recent",
      },
    );

    expect(result.map((item) => item.favoriteId)).toEqual(["fav-1"]);
  });
});
