import { describe, expect, it } from "vitest";

import {
  buildEmbeddingConfigFingerprint,
  buildEmbeddingReindexState,
  embeddingConfigChangeRequiresReindex,
  type EmbeddingConfigSnapshot,
} from "@/lib/ai/embedding-config-state";

function createSnapshot(overrides: Partial<EmbeddingConfigSnapshot> = {}): EmbeddingConfigSnapshot {
  return {
    provider: "local",
    model: "nomic-embed-text",
    baseUrl: "http://127.0.0.1:11434/v1",
    vectorDimensions: 768,
    schemaDimensions: 768,
    ...overrides,
  };
}

describe("embedding-config-state", () => {
  it("builds a stable fingerprint from embedding settings that affect indexing", () => {
    expect(buildEmbeddingConfigFingerprint(createSnapshot())).toBe(
      buildEmbeddingConfigFingerprint(createSnapshot()),
    );
    expect(buildEmbeddingConfigFingerprint(createSnapshot({ model: "different-model" }))).not.toBe(
      buildEmbeddingConfigFingerprint(createSnapshot()),
    );
  });

  it("marks provider, model, base url, and dimensions changes as requiring reindex", () => {
    const previous = createSnapshot();

    expect(embeddingConfigChangeRequiresReindex(previous, createSnapshot({ provider: "gemini" }))).toBe(true);
    expect(embeddingConfigChangeRequiresReindex(previous, createSnapshot({ model: "text-embedding-004" }))).toBe(true);
    expect(embeddingConfigChangeRequiresReindex(previous, createSnapshot({ baseUrl: "http://localhost:8080/v1" }))).toBe(true);
    expect(embeddingConfigChangeRequiresReindex(previous, createSnapshot({ vectorDimensions: 1024 }))).toBe(true);
    expect(embeddingConfigChangeRequiresReindex(previous, createSnapshot({ schemaDimensions: 1536 }))).toBe(true);
  });

  it("does not mark identical embedding settings as requiring reindex", () => {
    const previous = createSnapshot();
    const next = createSnapshot();

    expect(embeddingConfigChangeRequiresReindex(previous, next)).toBe(false);
  });

  it("keeps selected and active generation fingerprints separate while a rebuild is in progress", () => {
    const activeConfig = createSnapshot({
      provider: "gemini",
      model: "gemini-embedding-001",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      vectorDimensions: 1536,
      schemaDimensions: 1536,
    });
    const selectedConfig = createSnapshot({
      provider: "local",
      model: "nomic-embed-text",
      baseUrl: "http://127.0.0.1:11434/v1",
      vectorDimensions: 768,
      schemaDimensions: 768,
    });

    const state = buildEmbeddingReindexState({
      activeConfig,
      selectedConfig,
      activeGenerationId: "gen-active",
      selectedGenerationId: "gen-selected",
      pendingGenerationId: "gen-selected",
      pendingJobId: "job-rebuild",
      pendingJobStatus: "processing",
    });

    expect(state.required).toBe(true);
    expect(state.status).toBe("processing");
    expect(state.activeFingerprint).toBe(buildEmbeddingConfigFingerprint(activeConfig));
    expect(state.selectedFingerprint).toBe(buildEmbeddingConfigFingerprint(selectedConfig));
    expect(state.activeGenerationId).toBe("gen-active");
    expect(state.selectedGenerationId).toBe("gen-selected");
    expect(state.pendingGenerationId).toBe("gen-selected");
    expect(state.activationPending).toBe(true);
  });

  it("derives processing progress from total and remaining document counts", () => {
    const state = buildEmbeddingReindexState({
      activeConfig: createSnapshot({
        provider: "gemini",
        model: "gemini-embedding-001",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        vectorDimensions: 1536,
        schemaDimensions: 1536,
      }),
      selectedConfig: createSnapshot(),
      pendingJobStatus: "processing",
      totalDocuments: 20,
      remainingDocuments: 5,
    });

    expect(state.status).toBe("processing");
    expect(state.progressStatus).toBe("processing");
    expect(state.processedDocuments).toBe(15);
    expect(state.progressPercent).toBe(75);
    expect(state.progressLabel).toBe("Rebuilding embeddings");
  });

  it("surfaces activation pending as a dedicated final step once documents are embedded", () => {
    const state = buildEmbeddingReindexState({
      activeConfig: createSnapshot({
        provider: "gemini",
        model: "gemini-embedding-001",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        vectorDimensions: 1536,
        schemaDimensions: 1536,
      }),
      selectedConfig: createSnapshot(),
      totalDocuments: 12,
      remainingDocuments: 0,
    });

    expect(state.activationPending).toBe(true);
    expect(state.progressStatus).toBe("activating");
    expect(state.progressPercent).toBe(100);
    expect(state.progressLabel).toBe("Activating new retrieval generation");
  });

  it("surfaces failed rebuild state with the last backend error", () => {
    const state = buildEmbeddingReindexState({
      activeConfig: createSnapshot({
        provider: "gemini",
        model: "gemini-embedding-001",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        vectorDimensions: 1536,
        schemaDimensions: 1536,
      }),
      selectedConfig: createSnapshot(),
      status: "failed",
      lastError: "Embedding provider not configured",
      totalDocuments: 8,
      remainingDocuments: 8,
    });

    expect(state.status).toBe("failed");
    expect(state.progressStatus).toBe("failed");
    expect(state.progressPercent).toBe(0);
    expect(state.lastError).toBe("Embedding provider not configured");
  });
});
