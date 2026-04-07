import { describe, expect, it } from "vitest";

import { updateEmbeddingBatch } from "../../../supabase/functions/_shared/search-index-maintenance.ts";

describe("search-index-maintenance", () => {
  it("stores embedding provider metadata and schema dimensions", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const adminClient = {
      from: () => ({
        update: (values: Record<string, unknown>) => ({
          eq: async () => {
            updates.push(values);
            return { error: null };
          },
        }),
      }),
    };
    const embeddingProvider = {
      embedDocuments: async () => ({
        embeddings: [[0.1, 0.2, 0.3]],
        model: "local-embed",
        providerConfigured: true,
        providerUsed: "local",
        configurationError: null,
        configuredDimensions: 5,
        storageDimensions: 3,
      }),
      toVectorString: (embedding: number[]) => `[${embedding.join(",")}]`,
    };

    await updateEmbeddingBatch(
      adminClient as any,
      embeddingProvider as any,
      [{ id: "doc-1", search_text: "employee" }],
    );

    expect(updates[0]).toMatchObject({
      embedding_model: "local-embed",
      embedding_provider: "local",
      embedding_dimensions: 3,
    });
  });
});
