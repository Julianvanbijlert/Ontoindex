import type { EmbeddingDimensionCompatibility } from "./embedding-dimensions.ts";

export interface EmbeddingModelInfo {
  provider: string;
  model: string | null;
  dimensions: number;
  storageDimensions?: number | null;
}

export interface EmbeddingProviderClient {
  embedQuery(text: string): Promise<{
    embedding: number[];
    info: EmbeddingModelInfo;
    providerConfigured?: boolean;
    providerUsed?: string | null;
    configurationError?: string | null;
    dimensionCompatibility?: EmbeddingDimensionCompatibility;
  }>;
  embedDocuments(texts: string[]): Promise<{
    embeddings: number[][];
    info: EmbeddingModelInfo;
    providerConfigured?: boolean;
    providerUsed?: string | null;
    configurationError?: string | null;
    dimensionCompatibility?: EmbeddingDimensionCompatibility;
  }>;
  getModelInfo(): EmbeddingModelInfo;
}
