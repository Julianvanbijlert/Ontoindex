import { describe, expect, it, vi } from "vitest";

import {
  embedStaleDocuments,
  syncEntity,
  syncOntologySubtree,
  type SearchEmbeddingProvider,
  type SearchIndexMaintenanceAdminClient,
} from "../../supabase/functions/_shared/search-index-maintenance";

function createAdminClientMock() {
  const rpc = vi.fn();
  const updateEq = vi.fn();
  const update = vi.fn(() => ({ eq: updateEq }));
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn((table: string) => {
    if (table === "search_document_embeddings") {
      return { upsert };
    }

    return { update };
  });

  return {
    client: {
      rpc,
      from,
    } as unknown as SearchIndexMaintenanceAdminClient,
    rpc,
    from,
    update,
    eq: updateEq,
    upsert,
  };
}

function createEmbeddingProviderMock(overrides: Partial<SearchEmbeddingProvider> = {}): SearchEmbeddingProvider {
  return {
    embedDocuments: vi.fn(async (texts: string[]) => ({
      embeddings: texts.map(() => [0.1, 0.2, 0.3]),
      model: "test-model",
      providerConfigured: true,
      providerUsed: "local",
      configuredDimensions: 3,
      storageDimensions: 3,
    })),
    toVectorString: vi.fn((embedding: number[]) => `[${embedding.join(",")}]`),
    ...overrides,
  };
}

describe("search-index-maintenance", () => {
  it("delegates syncEntity to the backend rpc contract", async () => {
    const { client, rpc } = createAdminClientMock();
    rpc.mockResolvedValue({
      data: {
        entityId: "def-1",
        entityType: "definition",
        syncedCount: 2,
        jobId: "job-1",
      },
      error: null,
    });

    const result = await syncEntity(client, "def-1");

    expect(rpc).toHaveBeenCalledWith("sync_search_index_entity", {
      _entity_id: "def-1",
    });
    expect(result).toMatchObject({
      entityId: "def-1",
      jobId: "job-1",
    });
  });

  it("delegates syncOntologySubtree to the backend rpc contract", async () => {
    const { client, rpc } = createAdminClientMock();
    rpc.mockResolvedValue({
      data: {
        ontologyId: "onto-1",
        syncedCount: 5,
        jobId: "job-2",
      },
      error: null,
    });

    const result = await syncOntologySubtree(client, "onto-1");

    expect(rpc).toHaveBeenCalledWith("sync_search_index_ontology_subtree", {
      _ontology_id: "onto-1",
    });
    expect(result).toMatchObject({
      ontologyId: "onto-1",
      jobId: "job-2",
    });
  });

  it("rejects untrusted syncEntity calls when the backend reports search_documents RLS", async () => {
    const { client, rpc } = createAdminClientMock();
    rpc.mockResolvedValue({
      data: null,
      error: {
        message: "new row violates row-level security policy for table \"search_documents\"",
      },
    });

    await expect(syncEntity(client, "def-unauthorized")).rejects.toMatchObject({
      message: expect.stringContaining("search_documents"),
    });
  });

  it("claims queued stale documents, writes a pending embedding generation, and activates it only after the build completes", async () => {
    const { client, rpc, from, upsert } = createAdminClientMock();
    const embeddingProvider = createEmbeddingProviderMock();

    rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
      if (name === "claim_search_index_job") {
        if ((args?._worker_id as string) === "worker-1" && rpc.mock.calls.length === 1) {
          return { data: [], error: null };
        }

        return {
          data: [{ id: "job-embed-1", job_type: "embed_stale_documents", metadata: {}, attempts: 1 }],
          error: null,
        };
      }

      if (name === "list_stale_search_documents") {
        if (args?._limit === 1) {
          const limitOneCalls = rpc.mock.calls.filter(([rpcName, rpcArgs]) => (
            rpcName === "list_stale_search_documents" && rpcArgs?._limit === 1
          )).length;

          if (limitOneCalls > 1) {
            return {
              data: [],
              error: null,
            };
          }

          return {
            data: [{ id: "doc-1", search_text: "API gateway identity" }],
            error: null,
          };
        }

        return {
          data: [
            { id: "doc-1", search_text: "API gateway identity" },
            { id: "doc-2", search_text: "SSO approval workflow" },
          ],
          error: null,
        };
      }

      if (name === "enqueue_search_index_job") {
        return { data: "job-embed-1", error: null };
      }

      if (name === "complete_search_index_job") {
        return { data: null, error: null };
      }

      if (name === "activate_search_embedding_generation") {
        return { data: null, error: null };
      }

      throw new Error(`Unexpected rpc call: ${name}`);
    });

    const result = await embedStaleDocuments(client, embeddingProvider, {
      limit: 25,
      workerId: "worker-1",
      targetGenerationId: "gen-selected",
      targetEmbeddingFingerprint: "fp_selected",
    });

    expect(rpc).toHaveBeenCalledWith("enqueue_search_index_job", {
      _job_type: "embed_stale_documents",
      _metadata: {
        reason: "embed_stale_documents_requested",
        limit: 25,
        generationId: "gen-selected",
      },
    });
    expect(from).toHaveBeenCalledWith("search_document_embeddings");
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith("complete_search_index_job", {
      _job_id: "job-embed-1",
      _status: "completed",
      _error: null,
    });
    expect(rpc).toHaveBeenCalledWith("activate_search_embedding_generation", {
      _generation_id: "gen-selected",
    });
    expect(result).toMatchObject({
      claimed: true,
      jobId: "job-embed-1",
      documentCount: 2,
      synced: 2,
      providerConfigured: true,
      model: "test-model",
      generationActivated: true,
    });
  });

  it("does not activate the pending generation when more stale documents remain after a partial batch", async () => {
    const { client, rpc } = createAdminClientMock();
    const embeddingProvider = createEmbeddingProviderMock();

    rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
      if (name === "claim_search_index_job") {
        return {
          data: [{ id: "job-embed-3", job_type: "embed_stale_documents", metadata: {}, attempts: 1 }],
          error: null,
        };
      }

      if (name === "list_stale_search_documents") {
        if (args?._limit === 1) {
          const limitOneCalls = rpc.mock.calls.filter(([rpcName, rpcArgs]) => (
            rpcName === "list_stale_search_documents" && rpcArgs?._limit === 1
          )).length;

          if (limitOneCalls > 1) {
            return {
              data: [{ id: "doc-remaining", search_text: "remaining search text" }],
              error: null,
            };
          }

          return {
            data: [{ id: "doc-1", search_text: "API gateway identity" }],
            error: null,
          };
        }

        return {
          data: [
            { id: "doc-1", search_text: "API gateway identity" },
          ],
          error: null,
        };
      }

      if (name === "complete_search_index_job") {
        return { data: null, error: null };
      }

      throw new Error(`Unexpected rpc call: ${name}`);
    });

    const result = await embedStaleDocuments(client, embeddingProvider, {
      workerId: "worker-3",
      targetGenerationId: "gen-selected",
      targetEmbeddingFingerprint: "fp_selected",
    });

    expect(rpc).not.toHaveBeenCalledWith("activate_search_embedding_generation", expect.anything());
    expect(result).toMatchObject({
      claimed: true,
      synced: 1,
      generationActivated: false,
      remainingStaleDocuments: 1,
    });
  });

  it("activates the pending generation when a claimed job finds no remaining stale documents", async () => {
    const { client, rpc } = createAdminClientMock();
    const embeddingProvider = createEmbeddingProviderMock();

    rpc.mockImplementation(async (name: string) => {
      if (name === "claim_search_index_job") {
        return {
          data: [{ id: "job-embed-4", job_type: "embed_stale_documents", metadata: {}, attempts: 1 }],
          error: null,
        };
      }

      if (name === "list_stale_search_documents") {
        return {
          data: [],
          error: null,
        };
      }

      if (name === "complete_search_index_job" || name === "activate_search_embedding_generation") {
        return { data: null, error: null };
      }

      throw new Error(`Unexpected rpc call: ${name}`);
    });

    const result = await embedStaleDocuments(client, embeddingProvider, {
      workerId: "worker-4",
      targetGenerationId: "gen-selected",
      targetEmbeddingFingerprint: "fp_selected",
    });

    expect(rpc).toHaveBeenCalledWith("activate_search_embedding_generation", {
      _generation_id: "gen-selected",
    });
    expect(result).toMatchObject({
      claimed: true,
      synced: 0,
      generationActivated: true,
    });
  });

  it("does not report generation activation when the backend skips an outdated generation switch", async () => {
    const { client, rpc } = createAdminClientMock();
    const embeddingProvider = createEmbeddingProviderMock();

    rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
      if (name === "claim_search_index_job") {
        return {
          data: [{ id: "job-embed-5", job_type: "embed_stale_documents", metadata: {}, attempts: 1 }],
          error: null,
        };
      }

      if (name === "list_stale_search_documents") {
        if (args?._limit === 1) {
          return {
            data: [],
            error: null,
          };
        }

        return {
          data: [{ id: "doc-1", search_text: "API gateway identity" }],
          error: null,
        };
      }

      if (name === "complete_search_index_job") {
        return { data: null, error: null };
      }

      if (name === "activate_search_embedding_generation") {
        return {
          data: {
            activated: false,
            reason: "generation_no_longer_selected",
          },
          error: null,
        };
      }

      throw new Error(`Unexpected rpc call: ${name}`);
    });

    const result = await embedStaleDocuments(client, embeddingProvider, {
      workerId: "worker-5",
      targetGenerationId: "gen-stale",
      targetEmbeddingFingerprint: "fp_stale",
    });

    expect(rpc).toHaveBeenCalledWith("activate_search_embedding_generation", {
      _generation_id: "gen-stale",
    });
    expect(result).toMatchObject({
      claimed: true,
      synced: 1,
      generationActivated: false,
    });
  });

  it("marks the job failed when the embedding provider is unavailable", async () => {
    const { client, rpc, update } = createAdminClientMock();
    const embeddingProvider = createEmbeddingProviderMock({
      embedDocuments: vi.fn(async () => ({
        embeddings: [],
        model: null,
        providerConfigured: false,
        providerUsed: null,
        configuredDimensions: 3,
        storageDimensions: 3,
      })),
    });

    rpc.mockImplementation(async (name: string) => {
      if (name === "claim_search_index_job") {
        return {
          data: [{ id: "job-embed-2", job_type: "embed_stale_documents", metadata: {}, attempts: 1 }],
          error: null,
        };
      }

      if (name === "list_stale_search_documents") {
        return {
          data: [{ id: "doc-1", search_text: "API gateway identity" }],
          error: null,
        };
      }

      if (name === "complete_search_index_job") {
        return { data: null, error: null };
      }

      throw new Error(`Unexpected rpc call: ${name}`);
    });

    const result = await embedStaleDocuments(client, embeddingProvider, {
      workerId: "worker-2",
    });

    expect(update).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("complete_search_index_job", {
      _job_id: "job-embed-2",
      _status: "failed",
      _error: "Embedding provider not configured",
    });
    expect(result).toMatchObject({
      claimed: true,
      jobId: "job-embed-2",
      synced: 0,
      providerConfigured: false,
    });
  });
});
