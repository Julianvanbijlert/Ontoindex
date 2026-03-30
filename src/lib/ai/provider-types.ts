export type EmbeddingProvider =
  | "gemini"
  | "deepseek"
  | "huggingface"
  | "local";

export type ChatProvider =
  | "deepseek"
  | "gemini"
  | "mock";

export interface ProviderSecretStatus {
  configured: boolean;
  masked: string | null;
  updatedAt: string | null;
}
