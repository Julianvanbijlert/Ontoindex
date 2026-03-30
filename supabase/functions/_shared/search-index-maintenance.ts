export const DEFAULT_BATCH_SIZE = 100;
export const EMBEDDING_BATCH_SIZE = 20;

export interface SearchDocumentRecord {
  id: string;
  search_text: string;
}

export interface SearchIndexJobClaim {
  id: string;
  job_type: string;
  metadata: Record<string, unknown> | null;
  attempts: number;
}

export interface SearchIndexMaintenanceRpcResponse<T> {
  data: T | null;
  error: Error | { message?: string } | null;
}

export interface SearchIndexMaintenanceUpdateResult {
  error: Error | { message?: string } | null;
}

export interface SearchDocumentsTableClient {
  update(values: Record<string, unknown>): {
    eq(column: string, value: string): Promise<SearchIndexMaintenanceUpdateResult>;
  };
}

export interface SearchIndexMaintenanceAdminClient {
  rpc<T = unknown>(name: string, args?: Record<string, unknown>): Promise<SearchIndexMaintenanceRpcResponse<T>>;
  from(table: "search_documents"): SearchDocumentsTableClient;
}

export interface SearchEmbeddingProviderResult {
  embeddings: number[][];
  model: string | null;
  providerConfigured: boolean;
  providerUsed?: string | null;
  configurationError?: string | null;
}

export interface SearchEmbeddingProvider {
  embedDocuments(texts: string[]): Promise<SearchEmbeddingProviderResult>;
  toVectorString(embedding: number[]): string;
}

export function normalizeBatchSize(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return DEFAULT_BATCH_SIZE;
  }

  return Math.max(1, Math.min(Math.trunc(value as number), 500));
}

export async function claimEmbedJob(
  adminClient: SearchIndexMaintenanceAdminClient,
  workerId: string,
) {
  const { data, error } = await adminClient.rpc<SearchIndexJobClaim[]>("claim_search_index_job", {
    _job_type: "embed_stale_documents",
    _worker_id: workerId,
  });

  if (error) {
    throw error;
  }

  return data?.[0] || null;
}

export async function ensureEmbedJob(
  adminClient: SearchIndexMaintenanceAdminClient,
  workerId: string,
  limit: number,
) {
  let claimedJob = await claimEmbedJob(adminClient, workerId);

  if (claimedJob) {
    return claimedJob;
  }

  const { data: staleDocuments, error: staleError } = await adminClient.rpc<SearchDocumentRecord[]>(
    "list_stale_search_documents",
    { _limit: 1 },
  );

  if (staleError) {
    throw staleError;
  }

  if (!staleDocuments || staleDocuments.length === 0) {
    return null;
  }

  const { error: enqueueError } = await adminClient.rpc<string>("enqueue_search_index_job", {
    _job_type: "embed_stale_documents",
    _metadata: {
      reason: "embed_stale_documents_requested",
      limit,
    },
  });

  if (enqueueError) {
    throw enqueueError;
  }

  claimedJob = await claimEmbedJob(adminClient, workerId);
  return claimedJob;
}

export async function fetchStaleDocuments(
  adminClient: SearchIndexMaintenanceAdminClient,
  limit: number,
) {
  const { data, error } = await adminClient.rpc<SearchDocumentRecord[]>("list_stale_search_documents", {
    _limit: limit,
  });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function updateEmbeddingBatch(
  adminClient: SearchIndexMaintenanceAdminClient,
  embeddingProvider: SearchEmbeddingProvider,
  documents: SearchDocumentRecord[],
) {
  const { embeddings, model, providerConfigured, providerUsed, configurationError } = await embeddingProvider.embedDocuments(
    documents.map((document) => document.search_text),
  );

  if (!providerConfigured) {
    console.warn("embedding_batch_skipped", {
      providerUsed: providerUsed || null,
      model,
      documentCount: documents.length,
      reason: "provider_not_configured",
    });
    return {
      model,
      providerConfigured,
      providerUsed: providerUsed || null,
      configurationError: configurationError || null,
      synced: 0,
    };
  }

  await Promise.all(
    documents.map(async (document, index) => {
      const { error } = await adminClient
        .from("search_documents")
        .update({
          embedding: embeddings[index] ? embeddingProvider.toVectorString(embeddings[index]) : null,
          embedding_model: model,
          embedding_updated_at: new Date().toISOString(),
        })
        .eq("id", document.id);

      if (error) {
        throw error;
      }
    }),
  );

  console.info("embedding_batch_updated", {
    providerUsed: providerUsed || null,
    model,
    documentCount: documents.length,
    updatedRowCount: documents.length,
  });

  return {
    model,
    providerConfigured,
    providerUsed: providerUsed || null,
    configurationError: null,
    synced: documents.length,
  };
}

export async function syncEntity(
  adminClient: SearchIndexMaintenanceAdminClient,
  entityId: string,
) {
  const { data, error } = await adminClient.rpc<Record<string, unknown>>("sync_search_index_entity", {
    _entity_id: entityId,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function syncOntologySubtree(
  adminClient: SearchIndexMaintenanceAdminClient,
  ontologyId: string,
) {
  const { data, error } = await adminClient.rpc<Record<string, unknown>>("sync_search_index_ontology_subtree", {
    _ontology_id: ontologyId,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function embedStaleDocuments(
  adminClient: SearchIndexMaintenanceAdminClient,
  embeddingProvider: SearchEmbeddingProvider,
  input?: {
    limit?: number;
    workerId?: string;
  },
) {
  const limit = normalizeBatchSize(input?.limit);
  const workerId = input?.workerId?.trim() || "search-index-worker";
  const startedAt = Date.now();
  const claimedJob = await ensureEmbedJob(adminClient, workerId, limit);

  if (!claimedJob) {
    return {
      claimed: false,
      documentCount: 0,
      synced: 0,
      tookMs: Date.now() - startedAt,
    };
  }

  try {
    const documents = await fetchStaleDocuments(adminClient, limit);

    if (documents.length === 0) {
      await adminClient.rpc("complete_search_index_job", {
        _job_id: claimedJob.id,
        _status: "completed",
        _error: null,
      });

      return {
        claimed: true,
        jobId: claimedJob.id,
        documentCount: 0,
        synced: 0,
        tookMs: Date.now() - startedAt,
      };
    }

    let synced = 0;
    let model: string | null = null;
    let providerConfigured = false;
    let providerUsed: string | null = null;
    let configurationError: string | null = null;

    for (let index = 0; index < documents.length; index += EMBEDDING_BATCH_SIZE) {
      const batch = documents.slice(index, index + EMBEDDING_BATCH_SIZE);
      const result = await updateEmbeddingBatch(adminClient, embeddingProvider, batch);
      model = result.model;
      providerConfigured = result.providerConfigured;
      providerUsed = result.providerUsed || providerUsed;
      configurationError = result.configurationError || configurationError;
      synced += result.synced;

      if (!providerConfigured) {
        break;
      }
    }

    await adminClient.rpc("complete_search_index_job", {
      _job_id: claimedJob.id,
      _status: providerConfigured ? "completed" : "failed",
      _error: providerConfigured ? null : (configurationError || "Embedding provider not configured"),
    });

    return {
      claimed: true,
      jobId: claimedJob.id,
      documentCount: documents.length,
      model,
      providerConfigured,
      providerUsed,
      configurationError,
      synced,
      tookMs: Date.now() - startedAt,
    };
  } catch (error) {
    await adminClient.rpc("complete_search_index_job", {
      _job_id: claimedJob.id,
      _status: "failed",
      _error: error instanceof Error ? error.message : "Embedding sync failed",
    });
    throw error;
  }
}
