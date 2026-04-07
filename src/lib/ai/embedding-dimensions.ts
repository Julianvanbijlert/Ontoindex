export type EmbeddingDimensionCompatibilityStatus = "match" | "padded" | "truncated";

export interface EmbeddingDimensionCompatibility {
  status: EmbeddingDimensionCompatibilityStatus;
  mismatch: boolean;
  message: string | null;
}

export function resolveEmbeddingDimensionCompatibility(
  configuredDimensions: number,
  schemaDimensions: number,
): EmbeddingDimensionCompatibility {
  if (configuredDimensions === schemaDimensions) {
    return {
      status: "match",
      mismatch: false,
      message: null,
    };
  }

  if (configuredDimensions < schemaDimensions) {
    return {
      status: "padded",
      mismatch: true,
      message: `Embedding model dimensions (${configuredDimensions}) do not match schema dimensions (${schemaDimensions}). Vectors will be padded until the schema is updated.`,
    };
  }

  return {
    status: "truncated",
    mismatch: true,
    message: `Embedding model dimensions (${configuredDimensions}) do not match schema dimensions (${schemaDimensions}). Vectors will be truncated until the schema is updated.`,
  };
}
